import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgv, UsageError } from "../src/lib/args.js";
import { resolveConfig, ConfigError } from "../src/lib/config.js";
import { stripComments } from "../src/lib/strip.js";
import { nameRuns } from "../src/lib/surfaces.js";
import { buildContext, evalRule, ScanError } from "../src/lib/engine.js";
import { validatePack } from "../src/lib/pack-schema.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(root, "src/cli.js");
const FIXTURE = path.join(root, "tests/fixtures/polyglot/bouncer.config.json");
const cli = (args, input) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", input });
const rule = (pack, id) => JSON.parse(fs.readFileSync(path.join(root, `src/packs/${pack}.json`))).rules.find((r) => r.id === id);

function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bouncer-ag-"));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}
const ctxOf = (dir, extra = {}) => buildContext({ target: { repoRoot: dir }, ...extra });
const run = (r, dir) => evalRule(r, ctxOf(dir), { id: "t" });

// ── args ──
test("boolean flags never swallow the next positional", () => {
  const p = parseArgv(["explain", "--json", "aadc.dpia-exists"]);
  assert.equal(p.flags.json, true);
  assert.deepEqual(p.positionals, ["aadc.dpia-exists"]);
});
test("unknown flags and missing values are usage errors", () => {
  assert.throws(() => parseArgv(["check", "--bogus"]), UsageError);
  assert.throws(() => parseArgv(["check", "--config"]), UsageError);
  assert.throws(() => parseArgv(["nope"]), UsageError);
});
test("repeatable --pack/--ignore and leading flag defaults to check", () => {
  const p = parseArgv(["--ignore", "a", "--ignore=b", "-p", "uk-osa"]);
  assert.equal(p.command, "check");
  assert.deepEqual(p.flags.ignore, ["a", "b"]);
  assert.deepEqual(p.flags.pack, ["uk-osa"]);
});

// ── config ──
test("config validation rejects bad shapes and unknown adapters/languages", () => {
  assert.throws(() => resolveConfig({ target: { adapter: "rails" } }), ConfigError);
  assert.throws(() => resolveConfig({ target: { languages: ["cobol"] } }), ConfigError);
  assert.throws(() => resolveConfig({ packs: "uk-osa" }), ConfigError);
  assert.throws(() => resolveConfig({ failOn: ["pass"] }), ConfigError);
  const cfg = resolveConfig({ typo: 1 });
  assert.equal(cfg.target.adapter, "auto");
  assert.match(cfg._warnings[0], /typo/);
});

// ── comment stripping ──
test("stripComments removes comments per family, keeps strings and line count", () => {
  const js = stripComments("a // ageVerification\nconst u = 'http://x'; /* dob */ b", "js");
  assert.ok(!/ageVerification|dob/.test(js));
  assert.ok(js.includes("'http://x'"));
  assert.equal(js.split("\n").length, 2);
  assert.ok(!stripComments("x = 1  # dob\n", "python").includes("dob"));
  assert.ok(!stripComments('def f():\n    """dob"""\n', "python").includes("dob"));
  assert.ok(stripComments('s = "dob # not a comment"', "python").includes("dob"));
  assert.ok(!stripComments("<p>hi</p> <!-- dpia -->", "markup").includes("dpia"));
  assert.ok(stripComments("const re = /\\/\\/x/; dob()", "js").includes("dob()"));
  assert.ok(stripComments("<p>Don't</p>\nconst dob = 1", "js").includes("const dob"));
});

// ── surfaces ──
test("surface names match across naming conventions, not substrings", () => {
  for (const p of ["internal/signup/h.go", "app/sign_up.py", "src/SignUpController.java", "web/sign-up.ts"]) {
    assert.ok(nameRuns(p).has("signup"), p);
  }
  assert.ok(!nameRuns("src/author.ts").has("auth"));
});

// ── engine ──
test("missing repo / nothing to scan are hard errors", () => {
  assert.throws(() => buildContext({ target: { repoRoot: "/definitely/not/here" } }), ScanError);
  const empty = repo({ "README": "x" });
  assert.throws(() => ctxOf(empty, { target: { repoRoot: empty, roots: ["app"] } }), ScanError);
});
test("Go, Python and Java are all scanned; tests are excluded", () => {
  const dir = repo({
    "internal/chat/chat.go": "func reportContent() {}",
    "app/chat/views.py": "def block_user(): pass",
    "src/main/java/Chat.java": "class Chat { void muteUser(){} }",
    "internal/chat/chat_test.go": "func moderate() {}",
  });
  const ctx = ctxOf(dir);
  assert.deepEqual(Object.keys(ctx.languages).sort(), ["go", "java", "python"]);
  assert.equal(ctx.excluded, 1);
  assert.equal(run(rule("uk-osa", "osa.report-mechanism-ugc"), dir).status, "pass");
  assert.equal(run(rule("uk-osa", "osa.block-mechanism-ugc"), dir).status, "pass");
  assert.equal(run(rule("uk-osa", "osa.content-moderation-present"), dir).status, "fail");
});
test("comments are not evidence", () => {
  const dir = repo({ "app/signup/page.tsx": "// TODO: collect dateOfBirth and parentalConsent\nexport default 1" });
  assert.equal(run(rule("uk-aadc", "aadc.age-assurance-present"), dir).status, "fail");
  assert.equal(run(rule("uk-aadc", "aadc.parental-consent-under13"), dir).status, "fail");
});
test("governance-only rules are unknown without governance docs (no 'any' fallback)", () => {
  const dir = repo({ "app/x.ts": "// risk assessment DPIA\nconst dpia = 'DPIA'" });
  assert.equal(run(rule("uk-aadc", "aadc.dpia-exists"), dir).status, "unknown");
  assert.equal(run(rule("uk-osa", "osa.illegal-content-risk-assessment"), dir).status, "unknown");
});
test("PDF-only governance evidence is unknown (unreadable), not pass/fail", () => {
  const dir = repo({ "app/x.ts": "1", "docs/DPIA.pdf": "%PDF-1.4\u0000binary" });
  const f = run(rule("uk-aadc", "aadc.dpia-exists"), dir);
  assert.equal(f.status, "unknown");
  assert.equal(f.reason, "unreadable-only");
});
test("high-privacy default no longer passes on any `true`", () => {
  const bad = repo({ "app/profile/s.ts": "const visibility = { default: true }" });
  assert.equal(run(rule("uk-aadc", "aadc.high-privacy-default"), bad).status, "fail");
  const go = repo({ "internal/profile/d.go": 'var d = Settings{Visibility: "private"}' });
  assert.equal(run(rule("uk-aadc", "aadc.high-privacy-default"), go).status, "pass");
});
test("geolocation rule is unknown when the app has no location feature", () => {
  const dir = repo({ "app/profile/p.ts": "const defaults = { theme: false }" });
  assert.equal(run(rule("uk-aadc", "aadc.geolocation-default-off"), dir).reason, "precondition-not-met");
  const on = repo({ "app/profile/p.ts": "navigator.geolocation.getCurrentPosition(cb)\nconst shareLocation = true" });
  assert.equal(run(rule("uk-aadc", "aadc.geolocation-default-off"), on).status, "fail");
});
test("multi-line JSX self-declared age checkbox is caught (scope: file)", () => {
  const dir = repo({ "app/signup/f.tsx": '<input\n  type="checkbox"\n  name="age"\n/> I am over 18' });
  assert.equal(run(rule("uk-aadc", "aadc.self-declared-age-insufficient"), dir).status, "fail");
});
test("encryption rule no longer accepts bcrypt alone", () => {
  const dir = repo({ "src/security/hash.ts": "bcrypt.hash(pw, 10)" });
  assert.equal(run(rule("ng-ndpc", "ndpc.security-encryption"), dir).status, "fail");
});
test("VAT rate requires the 7.5% value, not just a name", () => {
  const name = repo({ "src/payments/tax.ts": "export const VAT_RATE = 0.05" });
  assert.equal(run(rule("ng-firs", "firs.vat-rate-7-5"), name).status, "fail");
  const ok = repo({ "src/payments/tax.py": "VAT_RATE = 0.075" });
  assert.equal(run(rule("ng-firs", "firs.vat-rate-7-5"), ok).status, "pass");
});

// ── pack validation ──
test("validatePack catches unknown surfaces, bad regex, duplicate ids", () => {
  const problems = validatePack({
    id: "x",
    rules: [
      { id: "a", assert: { find: "x", in: ["sigup"] } },
      { id: "a", assert: { find: "(" } },
      { id: "b", severity: "urgent", assert: { find: "x", expect: "maybe" } },
    ],
  });
  assert.ok(problems.some((p) => /unknown surface "sigup"/.test(p)));
  assert.ok(problems.some((p) => /duplicate rule id/.test(p)));
  assert.ok(problems.some((p) => /bad regex/.test(p)));
  assert.ok(problems.some((p) => /severity/.test(p)));
  assert.ok(problems.some((p) => /expect/.test(p)));
});

// ── CLI ──
test("CLI check on polyglot fixture: tables, exit 1 on fail, --no-fail exits 0", () => {
  const r = cli(["check", "--config", FIXTURE]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /┌/);
  assert.match(r.stdout, /languages: .*go/);
  assert.equal(cli(["check", "--config", FIXTURE, "--no-fail"]).status, 0);
});
test("CLI --json is clean JSON with additive fields; test file excluded", () => {
  const r = cli(["check", "--config", FIXTURE, "--json", "--no-fail"]);
  const out = JSON.parse(r.stdout);
  assert.ok(out.meta.excluded >= 1);
  assert.equal(out.findings.find((f) => f.ruleId === "osa.block-mechanism-ugc").status, "fail");
  assert.equal(out.findings.find((f) => f.ruleId === "aadc.parental-consent-under13").status, "fail");
  assert.equal(out.findings.find((f) => f.ruleId === "aadc.dpia-exists").status, "pass");
});
test("CLI --ignore is applied and unknown ids warn on stderr", () => {
  const r = cli(["check", "--config", FIXTURE, "--json", "--no-fail", "--ignore", "aadc.dpia-exists", "--ignore", "nope.rule"]);
  assert.ok(!JSON.parse(r.stdout).findings.some((f) => f.ruleId === "aadc.dpia-exists"));
  assert.match(r.stderr, /nope\.rule/);
});
test("CLI errors go to stderr with exit 2; invalid --status rejected", () => {
  const r = cli(["check", "--json", "--config", "/nope.json"]);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /Config not found/);
  assert.equal(cli(["check", "--config", FIXTURE, "--status", "bad"]).status, 2);
  const missing = repo({ "bouncer.config.json": '{"target":{"repo":"./nope"}}' });
  assert.equal(cli(["check", "--config", path.join(missing, "bouncer.config.json")]).status, 2);
});
test("CLI doctor, list, packs, explain", () => {
  assert.equal(cli(["doctor", "--config", FIXTURE]).status, 0);
  assert.equal(JSON.parse(cli(["doctor", "--config", FIXTURE, "--json"]).stdout).ok, true);
  assert.match(cli(["list", "--config", FIXTURE]).stdout, /aadc\.dpia-exists/);
  assert.match(cli(["packs"]).stdout, /ng-firs/);
  assert.equal(JSON.parse(cli(["explain", "--json", "aadc.dpia-exists", "--config", FIXTURE]).stdout).id, "aadc.dpia-exists");
});

// ── MCP ──
test("MCP: no reply to notifications, version negotiation, status validation", () => {
  const msgs = [
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", method: "notifications/unknown" },
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
    { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "compliance_check", arguments: { config: FIXTURE, status: "bad" } } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "compliance_check", arguments: { config: FIXTURE, status: "fail" } } },
  ];
  const r = cli(["mcp"], msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
  const lines = r.stdout.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.id), [1, 2, 3, 4]);
  assert.equal(lines[0].result.protocolVersion, "2025-03-26");
  assert.equal(lines[1].result.protocolVersion, "2025-06-18");
  assert.equal(lines[2].error.code, -32602);
  assert.ok(lines[3].result.structuredContent.findings.every((f) => f.status === "fail"));
});

test("generated API docs are excluded from evidence", () => {
  const dir = repo({ "src/chat/c.ts": "x()", "documentation/classes/ReportDto.html": "<p>reportContent blockUser</p>" });
  assert.equal(run(rule("uk-osa", "osa.block-mechanism-ugc"), dir).status, "fail");
});
test("internal docs quoting a banned clause do not trip the void-clause rule", () => {
  const dir = repo({ "app/terms/page.tsx": "<p>Refunds per policy.</p>", "docs/readiness.md": 'No blanket "all sales final" clauses.' });
  assert.equal(run(rule("ng-fccpc", "fccpc.no-final-sale-clause"), dir).status, "pass");
});

// ── smoke-test rough edges ──
test("check exits 1 when every rule is unknown, and --no-fail still exits 0", () => {
  const dir = repo({ "bouncer.config.json": '{"packs":["uk-osa"]}', "README.md": "# empty\n" });
  const cfg = path.join(dir, "bouncer.config.json");
  const r = cli(["check", "--config", cfg, "--json"]);
  const { totals } = JSON.parse(r.stdout);
  assert.equal(totals.pass + totals.fail, 0);
  assert.ok(totals.unknown > 0);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /every rule is unknown/);
  assert.equal(cli(["check", "--config", cfg, "--no-fail"]).status, 0);
});
test("a pass with no hits says how many files were scanned", () => {
  const dir = repo({ "bouncer.config.json": '{"packs":["uk-aadc"]}', "src/signup/index.ts": "export const signup = () => db.insert();\n" });
  const r = cli(["check", "--config", path.join(dir, "bouncer.config.json"), "--no-fail"]);
  assert.match(r.stdout, /aadc\.no-nudge-techniques\s+│ nothing offending in \d+ files? scanned/);
  const out = path.join(dir, "r.html");
  cli(["report", "--config", path.join(dir, "bouncer.config.json"), "--out", out]);
  assert.match(fs.readFileSync(out, "utf8"), /nothing offending in \d+ files? scanned/);
});
test("--version and -v print the package version", () => {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  for (const flag of ["--version", "-v"]) {
    const r = cli([flag]);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), version);
  }
});
test("an unknown command prints the help hint once", () => {
  const r = cli(["nonsense"]);
  assert.equal(r.status, 2);
  assert.equal(r.stderr.match(/bouncer help/g).length, 1);
});
test("underscore config keys are comments; ignores only warn for ids no pack defines", () => {
  assert.deepEqual(resolveConfig({ _note: "why" })._warnings, []);
  const r = cli(["check", "--config", FIXTURE, "--json", "--no-fail", "--pack", "uk-osa", "--ignore", "aadc.dpia-exists", "--ignore", "nope.rule"]);
  assert.doesNotMatch(r.stderr, /aadc\.dpia-exists/);
  assert.match(r.stderr, /"nope\.rule" is not defined by any pack/);
  const d = JSON.parse(cli(["doctor", "--config", FIXTURE, "--json", "--pack", "uk-osa"]).stdout);
  assert.ok(!d.checks.some((c) => c.name === "ignore"));
});

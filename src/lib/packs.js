import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContext, evalRule } from "./engine.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_DIR = path.resolve(here, "../packs");

/** Read a single pack JSON file and validate its shape minimally. */
function readPack(file) {
  const pack = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!pack.id) throw new Error(`Pack ${file} is missing "id".`);
  if (!Array.isArray(pack.rules)) throw new Error(`Pack ${pack.id} is missing a "rules" array.`);
  pack._file = file;
  return pack;
}

/** List every pack available to bouncer (built-in + any from extraDirs), as metadata. */
export function availablePacks(extraDirs = []) {
  const dirs = [BUILTIN_DIR, ...extraDirs];
  const out = [];
  const seen = new Set();
  for (const dir of dirs) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pack = readPack(path.join(dir, entry));
      if (seen.has(pack.id)) continue;
      seen.add(pack.id);
      out.push({
        id: pack.id,
        title: pack.title,
        authority: pack.authority,
        url: pack.url,
        rules: pack.rules.length,
        builtin: dir === BUILTIN_DIR,
      });
    }
  }
  return out;
}

/** Resolve the configured pack ids to loaded pack objects. */
export function loadPacks(cfg) {
  const dirs = [BUILTIN_DIR, ...(cfg.packDirs || [])];
  const wanted = cfg.packs && cfg.packs.length ? cfg.packs : null;
  const byId = new Map();

  for (const dir of dirs) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pack = readPack(path.join(dir, entry));
      if (!byId.has(pack.id)) byId.set(pack.id, pack);
    }
  }

  if (!wanted) return [...byId.values()];

  const resolved = [];
  for (const id of wanted) {
    const pack = byId.get(id);
    if (!pack) throw new Error(`Pack not found: ${id}. Run \`bouncer packs\` to list available packs.`);
    resolved.push(pack);
  }
  return resolved;
}

/** Run every rule in the configured packs against the target repo. */
export function runCheck(cfg) {
  const ctx = buildContext(cfg);
  const packs = loadPacks(cfg);
  const ignore = new Set(cfg.ignore || []);

  const findings = [];
  for (const pack of packs) {
    const meta = { id: pack.id, title: pack.title, authority: pack.authority };
    for (const rule of pack.rules) {
      if (ignore.has(rule.id)) continue;
      findings.push(evalRule(rule, ctx, meta));
    }
  }

  const totals = { pass: 0, fail: 0, unknown: 0 };
  for (const f of findings) totals[f.status] += 1;

  const checked = findings.length;
  const score = checked ? Math.round((totals.pass / checked) * 100) : 100;

  return {
    findings,
    totals,
    score,
    meta: {
      adapter: cfg.target.adapter,
      repo: ctx.root,
      filesScanned: ctx.files.length,
      packs: packs.map((p) => ({ id: p.id, title: p.title, authority: p.authority })),
    },
  };
}

/** Flat list of every rule the configured packs would apply (no scanning). */
export function listRules(cfg) {
  const packs = loadPacks(cfg);
  const rules = [];
  for (const pack of packs) {
    for (const rule of pack.rules) {
      rules.push({
        packId: pack.id,
        ruleId: rule.id,
        standard: rule.standard,
        severity: rule.severity || "medium",
        surface: typeof rule.surface === "string" ? rule.surface : undefined,
        intent: rule.intent,
      });
    }
  }
  return rules;
}

/** Find a single rule across the configured packs and render how it is checked. */
export function explainRule(cfg, ruleId) {
  const packs = loadPacks(cfg);
  for (const pack of packs) {
    const rule = pack.rules.find((r) => r.id === ruleId);
    if (rule) {
      return {
        packId: pack.id,
        packTitle: pack.title,
        authority: pack.authority,
        url: pack.url,
        ...rule,
        checks: renderAssert(rule.assert),
      };
    }
  }
  throw new Error(`Rule not found: ${ruleId}. Run \`bouncer list\` to see available rules.`);
}

/** Human-readable description of an assertion tree. */
function renderAssert(node, depth = 0) {
  const pad = "  ".repeat(depth);
  if (node.allOf) return [`${pad}ALL of:`, ...node.allOf.flatMap((n) => renderAssert(n, depth + 1))];
  if (node.anyOf) return [`${pad}ANY of:`, ...node.anyOf.flatMap((n) => renderAssert(n, depth + 1))];
  if (node.not) return [`${pad}NOT:`, ...renderAssert(node.not, depth + 1)];
  if (node.find) {
    const where = Array.isArray(node.in) ? node.in.join(", ") : node.in || "any";
    const expect = node.expect === "absent" ? "must NOT appear" : "must appear";
    return [`${pad}- /${node.find}/  ${expect} in surface [${where}]`];
  }
  if (node.allInFile) {
    const where = Array.isArray(node.in) ? node.in.join(", ") : node.in || "any";
    const expect = node.expect === "absent" ? "must NOT all co-occur" : "must all co-occur";
    return [
      `${pad}- all of these patterns ${expect} in a single file in surface [${where}]:`,
      ...node.allInFile.map((p) => `${pad}    /${p}/`),
    ];
  }
  return [`${pad}- (empty)`];
}

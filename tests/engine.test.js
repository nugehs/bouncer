import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expandBraces, globToRegExp, matchesAnyGlob } from "../src/lib/walk.js";
import { availablePacks } from "../src/lib/packs.js";
import { buildContext, evalRule } from "../src/lib/engine.js";

test("expandBraces expands a single group", () => {
  assert.deepEqual(expandBraces("a.{ts,tsx}"), ["a.ts", "a.tsx"]);
});

test("expandBraces expands multiple groups", () => {
  assert.deepEqual(expandBraces("{x,y}.{ts,tsx}"), ["x.ts", "x.tsx", "y.ts", "y.tsx"]);
});

test("globToRegExp matches across directories with **", () => {
  const re = globToRegExp("app/**/page.tsx");
  assert.ok(re.test("app/page.tsx"));
  assert.ok(re.test("app/a/b/page.tsx"));
  assert.ok(!re.test("src/page.tsx"));
});

test("single star does not cross directory boundary", () => {
  const re = globToRegExp("app/*.tsx");
  assert.ok(re.test("app/page.tsx"));
  assert.ok(!re.test("app/a/page.tsx"));
});

test("matchesAnyGlob honours brace groups", () => {
  assert.ok(matchesAnyGlob("components/Chat.tsx", ["**/*{Chat,Message}*.{ts,tsx}"]));
  assert.ok(!matchesAnyGlob("components/Button.tsx", ["**/*{Chat,Message}*.{ts,tsx}"]));
});

test("built-in packs load and parse", () => {
  const packs = availablePacks();
  const ids = packs.map((p) => p.id);
  assert.ok(ids.includes("uk-osa"));
  assert.ok(ids.includes("uk-aadc"));
  for (const p of packs) assert.ok(p.rules > 0);
});

function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bouncer-"));
  fs.mkdirSync(path.join(dir, "app/chat"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "app/chat/ChatBox.tsx"),
    "export function ChatBox(){ const onReport = () => reportContent(id); return <button onClick={onReport}>report message</button> }\n",
  );
  return dir;
}

test("evalRule returns pass when control is present", () => {
  const repo = fixtureRepo();
  const cfg = { target: { adapter: "next", repoRoot: repo, roots: ["app"] } };
  const ctx = buildContext(cfg);
  const rule = {
    id: "test.report",
    standard: "test",
    severity: "high",
    assert: { find: "reportContent|report message", in: ["ugc"], expect: "present" },
  };
  const finding = evalRule(rule, ctx, { id: "t", title: "Test", authority: "test" });
  assert.equal(finding.status, "pass");
  assert.ok(finding.hits.length > 0);
});

test("evalRule returns unknown when the surface is absent", () => {
  const repo = fixtureRepo();
  const cfg = { target: { adapter: "next", repoRoot: repo, roots: ["app"] } };
  const ctx = buildContext(cfg);
  const rule = {
    id: "test.gov",
    standard: "test",
    severity: "high",
    assert: { find: "DPIA", in: ["governance"], expect: "present" },
  };
  const finding = evalRule(rule, ctx, { id: "t", title: "Test", authority: "test" });
  assert.equal(finding.status, "unknown");
});

test("evalRule returns fail when a present surface lacks the control", () => {
  const repo = fixtureRepo();
  const cfg = { target: { adapter: "next", repoRoot: repo, roots: ["app"] } };
  const ctx = buildContext(cfg);
  const rule = {
    id: "test.block",
    standard: "test",
    severity: "high",
    assert: { find: "blockUser|onBlock", in: ["ugc"], expect: "present" },
  };
  const finding = evalRule(rule, ctx, { id: "t", title: "Test", authority: "test" });
  assert.equal(finding.status, "fail");
});

function settingsRepo(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bouncer-set-"));
  fs.mkdirSync(path.join(dir, "app/settings"), { recursive: true });
  fs.writeFileSync(path.join(dir, "app/settings/Privacy.tsx"), content);
  return dir;
}

test("allInFile passes only when every pattern co-occurs in one file", () => {
  const repo = settingsRepo("const profileVisibility = { default: 'private' }\n");
  const cfg = { target: { adapter: "next", repoRoot: repo, roots: ["app"] } };
  const ctx = buildContext(cfg);
  const rule = {
    id: "test.privacy",
    standard: "test",
    severity: "high",
    assert: {
      allInFile: ["visibility|profileVisibility", "default", "private"],
      in: ["profile"],
      expect: "present",
    },
  };
  assert.equal(evalRule(rule, ctx, { id: "t" }).status, "pass");
});

test("allInFile fails when one pattern is missing from the file", () => {
  const repo = settingsRepo("const profileVisibility = 'public'\n"); // no default, no private
  const cfg = { target: { adapter: "next", repoRoot: repo, roots: ["app"] } };
  const ctx = buildContext(cfg);
  const rule = {
    id: "test.privacy",
    standard: "test",
    severity: "high",
    assert: {
      allInFile: ["visibility|profileVisibility", "default", "private"],
      in: ["profile"],
      expect: "present",
    },
  };
  assert.equal(evalRule(rule, ctx, { id: "t" }).status, "fail");
});

test("react-native adapter resolves surfaces", () => {
  const repo = fixtureRepo();
  const cfg = { target: { adapter: "react-native", repoRoot: repo, roots: ["app"] } };
  const ctx = buildContext(cfg);
  assert.equal(ctx.adapter.id, "react-native");
  assert.ok(ctx.files.length > 0);
});

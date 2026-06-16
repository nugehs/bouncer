import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { availablePacks } from "../src/lib/packs.js";
import { buildContext, evalRule } from "../src/lib/engine.js";

const readPack = (id) => JSON.parse(fs.readFileSync(new URL(`../src/packs/${id}.json`, import.meta.url)));
const ruleOf = (id, ruleId) => {
  const r = readPack(id).rules.find((x) => x.id === ruleId);
  if (!r) throw new Error(`rule ${ruleId} not found in ${id}`);
  return r;
};

function repoWith(relPath, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bouncer-ng-"));
  const abs = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return dir;
}

const ctxFor = (repo, roots = ["app", "src", "lib"]) =>
  buildContext({ target: { adapter: "next", repoRoot: repo, roots } });

test("Nigeria packs load with rules", () => {
  const ids = availablePacks().map((p) => p.id);
  for (const id of ["ng-ndpc", "ng-fccpc", "ng-firs"]) assert.ok(ids.includes(id), `missing pack ${id}`);
});

// The void-clause rule is the one with the strongest claim (a FAIL says "your
// terms contain an unenforceable clause"), so its precision matters most:
// it must fire on a BLANKET clause and stay quiet on a tiered/conditional policy.
test("ng-fccpc void-clause rule fires on a blanket 'all sales final' clause", () => {
  const repo = repoWith("app/terms/page.tsx", "export default () => <p>All sales are final. No refunds whatsoever.</p>\n");
  const finding = evalRule(ruleOf("ng-fccpc", "fccpc.no-final-sale-clause"), ctxFor(repo), { id: "ng-fccpc" });
  assert.equal(finding.status, "fail");
  assert.ok(finding.hits.length > 0);
});

test("ng-fccpc void-clause rule stays quiet on a tiered / conditional refund policy", () => {
  const repo = repoWith(
    "app/terms/page.tsx",
    "export default () => <p>Full refund up to 48 hours. No refund: less than 24 hours before the event. These premium fees are non-refundable once the event is published.</p>\n",
  );
  const finding = evalRule(ruleOf("ng-fccpc", "fccpc.no-final-sale-clause"), ctxFor(repo), { id: "ng-fccpc" });
  assert.equal(finding.status, "pass");
});

test("ng-ndpc privacy-notice rule passes when a privacy page exists", () => {
  const repo = repoWith(
    "app/privacy/Privacy.tsx",
    "export const PrivacyPolicy = () => <main>Our privacy policy explains data protection.</main>\n",
  );
  const finding = evalRule(ruleOf("ng-ndpc", "ndpc.privacy-notice-present"), ctxFor(repo), { id: "ng-ndpc" });
  assert.equal(finding.status, "pass");
});

test("ng-ndpc data-subject-rights rule passes when export/delete flows exist", () => {
  const repo = repoWith(
    "src/gdpr/gdpr.controller.ts",
    "@Post('export-data') exportData(){} @Post('delete-account') deleteAccount(){}\n",
  );
  const finding = evalRule(ruleOf("ng-ndpc", "ndpc.data-subject-rights"), ctxFor(repo, ["src"]), { id: "ng-ndpc" });
  assert.equal(finding.status, "pass");
});

test("ng-ndpc NDPA-localization rule fails on a GDPR-only privacy posture", () => {
  const repo = repoWith(
    "lib/compliance/privacy.ts",
    "export const policy = 'We comply with the GDPR and CCPA for all users.'\n",
  );
  const finding = evalRule(ruleOf("ng-ndpc", "ndpc.ndpa-localized"), ctxFor(repo, ["lib"]), { id: "ng-ndpc" });
  assert.equal(finding.status, "fail");
});

test("ng-firs WHT rule fails when payouts ignore withholding tax", () => {
  const repo = repoWith("src/seller/payout.service.ts", "function payout(amount){ return transfer(amount); }\n");
  const finding = evalRule(ruleOf("ng-firs", "firs.wht-on-payouts"), ctxFor(repo, ["src"]), { id: "ng-firs" });
  assert.equal(finding.status, "fail");
});

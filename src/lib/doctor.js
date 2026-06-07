import fs from "node:fs";
import { loadPacks } from "./packs.js";
import { buildContext } from "./engine.js";

/** Sanity-check that config resolves, the target repo exists, the adapter loads, and packs parse. */
export function getDoctorReport(cfg) {
  const checks = [];

  const repoOk = fs.existsSync(cfg.target.repoRoot);
  checks.push({ name: "target repo", ok: repoOk, detail: cfg.target.repoRoot });

  let filesScanned = 0;
  let adapterOk = false;
  try {
    const ctx = buildContext(cfg);
    adapterOk = true;
    filesScanned = ctx.files.length;
  } catch (error) {
    checks.push({ name: "adapter", ok: false, detail: error.message });
  }
  if (adapterOk) {
    checks.push({ name: "adapter", ok: true, detail: `${cfg.target.adapter} · ${filesScanned} files visible` });
  }

  let packsOk = false;
  let packList = [];
  try {
    const packs = loadPacks(cfg);
    packsOk = true;
    packList = packs.map((p) => `${p.id} (${p.rules.length} rules)`);
  } catch (error) {
    checks.push({ name: "packs", ok: false, detail: error.message });
  }
  if (packsOk) {
    checks.push({ name: "packs", ok: true, detail: packList.join(", ") });
  }

  const ok = checks.every((c) => c.ok);
  return { ok, configPath: cfg._path, checks };
}

export function formatDoctorReport(report) {
  const lines = ["", "  bouncer doctor", `  config: ${report.configPath}`, ""];
  for (const c of report.checks) {
    lines.push(`    ${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);
  }
  lines.push("", `  ${report.ok ? "✓ all checks passed" : "✗ some checks failed"}`, "");
  return lines.join("\n");
}

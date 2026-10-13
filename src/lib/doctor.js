import fs from "node:fs";
import { resolvePacks, availablePackIndex } from "./packs.js";
import { buildContext } from "./engine.js";
import { renderTable, indent } from "./table.js";

/** Sanity-check config, target repo, visible files, languages, and packs. status: ok | warn | fail. */
export function getDoctorReport(cfg) {
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, ok: status !== "fail", detail });

  for (const w of cfg._warnings || []) add("config", "warn", w);
  const repoOk = fs.existsSync(cfg.target.repoRoot);
  add("target repo", repoOk ? "ok" : "fail", cfg.target.repoRoot);

  if (repoOk) {
    try {
      const ctx = buildContext(cfg, { allowEmpty: true });
      add("adapter", "ok", ctx.adapter.id);
      if (ctx.missingRoots.length) add("roots", "warn", `missing: ${ctx.missingRoots.join(", ")}`);
      add("files", ctx.files.length ? "ok" : "fail", `${ctx.files.length} visible, ${ctx.excluded} excluded`);
      const langs = Object.entries(ctx.languages).map(([l, n]) => `${l} ${n}`).join(", ");
      add("languages", langs ? "ok" : "warn", langs || "no source files in a registered language");
    } catch (error) {
      add("adapter", "fail", error.message);
    }
  }

  try {
    const { packs, warnings } = resolvePacks(cfg);
    add("packs", "ok", packs.map((p) => `${p.id} (${p.rules.length})`).join(", "));
    for (const w of warnings) add("pack files", "warn", w);
    const ids = new Set(packs.flatMap((p) => p.rules.map((r) => r.id)));
    for (const id of cfg.ignore || []) if (!ids.has(id)) add("ignore", "warn", `"${id}" is not in the selected packs`);
  } catch (error) {
    add("packs", "fail", error.message);
  }

  return { ok: checks.every((c) => c.ok), configPath: cfg._path, checks };
}

export function formatDoctorReport(report) {
  const mark = { ok: "✓", warn: "!", fail: "✗" };
  const table = renderTable(
    [
      { key: "s", label: "" },
      { key: "name", label: "Check" },
      { key: "detail", label: "Detail", flex: true },
    ],
    report.checks.map((c) => ({ s: mark[c.status], name: c.name, detail: c.detail })),
  );
  return ["", "  bouncer doctor", `  config: ${report.configPath}`, "", indent(table), "", `  ${report.ok ? "✓ all checks passed" : "✗ some checks failed"}`, ""].join("\n");
}

export { availablePackIndex };

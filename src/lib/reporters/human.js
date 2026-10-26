import { printText } from "../output.js";
import { GLYPH } from "../brand.js";
import { renderTable, indent } from "../table.js";
import { statusMatches, reasonText, cleanScanText } from "../verdicts.js";

const SEV_ORDER = { high: 0, medium: 1, low: 2 };
const STATUS_ORDER = { fail: 0, unknown: 1, pass: 2 };

/** Terminal report: summary table, per-pack control tables, then failure details. */
export function reportHuman(result, { statusFilter = "all", width } = {}) {
  const { findings, totals, score, meta } = result;
  const opts = width ? { width } : {};
  const langs = Object.entries(meta.languages || {}).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join(", ");

  printText("");
  printText(`  bouncer · compliance-controls report`);
  printText(`  repo:      ${meta.repo}`);
  printText(`  adapter:   ${meta.adapter} · files scanned: ${meta.filesScanned} · excluded: ${meta.excluded ?? 0}`);
  if (langs) printText(`  languages: ${langs}`);
  printText("");

  const byPack = groupByPack(findings);

  const summary = [...byPack.values()].map((rows) => packTotals(rows));
  summary.push({ pack: "TOTAL", pass: totals.pass, fail: totals.fail, unknown: totals.unknown, score: `${score}%` });
  printText(indent(renderTable(
    [
      { key: "pack", label: "Pack", flex: true },
      { key: "pass", label: `${GLYPH.pass} pass`, align: "right" },
      { key: "fail", label: `${GLYPH.fail} fail`, align: "right" },
      { key: "unknown", label: `${GLYPH.unknown} unknown`, align: "right" },
      { key: "score", label: "score", align: "right" },
    ],
    summary,
    opts,
  )));
  printText("");

  for (const rows of byPack.values()) {
    const shown = [...rows].filter((f) => statusMatches(f.status, statusFilter)).sort(byStatusThenSeverity);
    if (!shown.length) continue;
    printText(`  ${rows[0].packTitle}${rows[0].authority ? ` — ${rows[0].authority}` : ""}`);
    printText(indent(renderTable(
      [
        { key: "status", label: "Status" },
        { key: "severity", label: "Severity" },
        { key: "rule", label: "Rule", flex: true },
        { key: "evidence", label: "Evidence / reason", flex: true },
      ],
      shown.map((f) => ({ status: `${mark(f.status)} ${f.status}`, severity: f.severity, rule: f.ruleId, evidence: evidence(f) })),
      opts,
    )));
    printText("");
  }

  const fails = findings.filter((f) => f.status === "fail" && statusMatches(f.status, statusFilter));
  if (fails.length) {
    printText(`  Failures`);
    for (const f of fails.sort(byStatusThenSeverity)) {
      printText(`    ${GLYPH.fail} ${f.ruleId}  [${f.severity}]`);
      if (f.standard) printText(`        standard: ${f.standard}`);
      if (f.intent) printText(`        why:      ${f.intent}`);
      if (f.fix) printText(`        fix:      ${f.fix}`);
      for (const h of f.hits.slice(0, 3)) printText(`        offending: ${h.file}:${h.line}  ${h.excerpt}`);
    }
    printText("");
  }

  printText(`  ${GLYPH.pass} pass ${totals.pass}   ${GLYPH.fail} fail ${totals.fail}   ${GLYPH.unknown} unknown ${totals.unknown}   ·   score ${score}%`);
  printText(`  A pass means the coded control was found — not legal certification.`);
  printText("");
}

export function groupByPack(findings) {
  const byPack = new Map();
  for (const f of findings) {
    if (!byPack.has(f.packId)) byPack.set(f.packId, []);
    byPack.get(f.packId).push(f);
  }
  return byPack;
}

export function packTotals(rows) {
  const t = { pass: 0, fail: 0, unknown: 0 };
  for (const f of rows) t[f.status]++;
  return { pack: rows[0].packId, ...t, score: `${rows.length ? Math.round((t.pass / rows.length) * 100) : 100}%` };
}

export function evidence(f) {
  if (f.status === "pass") {
    const h = f.hits[0];
    if (!h) return cleanScanText(f.scanned);
    return `${h.file}:${h.line}${f.hits.length > 1 ? ` (+${f.hits.length - 1})` : ""}`;
  }
  if (f.status === "fail") {
    const h = f.hits[0];
    if (h) return `offending ${h.file}:${h.line}${f.hits.length > 1 ? ` (+${f.hits.length - 1})` : ""}`;
    return `no evidence in ${f.scanned} file${f.scanned === 1 ? "" : "s"} scanned`;
  }
  return reasonText(f.reason);
}

function byStatusThenSeverity(a, b) {
  if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  return (SEV_ORDER[a.severity] ?? 1) - (SEV_ORDER[b.severity] ?? 1);
}

function mark(status) {
  return status === "pass" ? GLYPH.pass : status === "fail" ? GLYPH.fail : GLYPH.unknown;
}

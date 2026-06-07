import { printText } from "../output.js";
import { GLYPH } from "../brand.js";

const SEV_ORDER = { high: 0, medium: 1, low: 2 };

/** Terminal report grouped by pack, ordered fail -> unknown -> pass within each pack. */
export function reportHuman(result, { statusFilter = "all" } = {}) {
  const { findings, totals, score, meta } = result;

  printText("");
  printText(`  bouncer · compliance-controls report`);
  printText(`  ${meta.repo}`);
  printText(`  adapter: ${meta.adapter} · files scanned: ${meta.filesScanned}`);
  printText("");

  const byPack = new Map();
  for (const f of findings) {
    if (!byPack.has(f.packId)) byPack.set(f.packId, []);
    byPack.get(f.packId).push(f);
  }

  for (const [, rows] of byPack) {
    const head = rows[0];
    printText(`  ${head.packTitle}`);
    printText(`  ${dim(head.authority || "")}`);
    const ordered = [...rows].sort(byStatusThenSeverity);
    for (const f of ordered) {
      if (statusFilter !== "all" && !statusMatches(f.status, statusFilter)) continue;
      printText(`    ${mark(f.status)} ${pad(f.severity, 6)} ${f.ruleId}`);
      printText(`        ${dim(f.standard || "")}`);
      if (f.status === "pass" && f.hits[0]) {
        printText(`        evidence: ${f.hits[0].file}:${f.hits[0].line}`);
      } else if (f.status === "fail") {
        printText(`        ${f.intent || ""}`);
        printText(`        fix: ${f.fix || ""}`);
        for (const h of f.hits.slice(0, 3)) {
          printText(`        offending: ${h.file}:${h.line}`);
        }
      } else if (f.status === "unknown") {
        printText(`        surface not located in this repo — can't determine`);
      }
    }
    printText("");
  }

  printText(`  ${GLYPH.pass} pass ${totals.pass}   ${GLYPH.fail} fail ${totals.fail}   ${GLYPH.unknown} unknown ${totals.unknown}   ·   score ${score}%`);
  printText("");
}

function byStatusThenSeverity(a, b) {
  const order = { fail: 0, unknown: 1, pass: 2 };
  if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
  return (SEV_ORDER[a.severity] ?? 1) - (SEV_ORDER[b.severity] ?? 1);
}

function statusMatches(status, filter) {
  if (filter === "fail") return status === "fail";
  if (filter === "unknown") return status === "unknown" || status === "fail";
  return true;
}

function mark(status) {
  return status === "pass" ? GLYPH.pass : status === "fail" ? GLYPH.fail : GLYPH.unknown;
}

function pad(s, n) {
  return String(s || "").padEnd(n);
}

function dim(s) {
  return s;
}

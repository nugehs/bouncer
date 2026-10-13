// Minimal box-drawing table renderer (no deps). Columns: { key, label, max?, flex?, align? }.
export function renderTable(columns, rows, { width = defaultWidth() } = {}) {
  const cell = (v) => String(v ?? "").replace(/\s+/g, " ");
  const len = (s) => [...s].length;
  const widths = columns.map((c) => Math.min(c.max ?? Infinity, Math.max(len(c.label), ...rows.map((r) => len(cell(r[c.key]))))));
  const total = () => widths.reduce((a, w) => a + w + 3, 1);
  // shrink flexible columns until it fits
  for (let guard = 0; total() > width && guard < 500; guard++) {
    let idx = -1;
    columns.forEach((c, i) => {
      if (c.flex && widths[i] > 8 && (idx === -1 || widths[i] > widths[idx])) idx = i;
    });
    if (idx === -1) break;
    widths[idx]--;
  }
  const fit = (s, w, align) => {
    const chars = [...s];
    const t = chars.length > w ? chars.slice(0, Math.max(0, w - 1)).join("") + "…" : s;
    const padN = w - len(t);
    return align === "right" ? " ".repeat(padN) + t : t + " ".repeat(padN);
  };
  const line = (l, m, r) => l + widths.map((w) => "─".repeat(w + 2)).join(m) + r;
  const row = (vals) => "│" + vals.map((v, i) => ` ${fit(v, widths[i], columns[i].align)} `).join("│") + "│";
  const out = [line("┌", "┬", "┐"), row(columns.map((c) => c.label)), line("├", "┼", "┤")];
  if (!rows.length) out.push(row(columns.map((_, i) => (i === 0 ? "(none)" : ""))));
  for (const r of rows) out.push(row(columns.map((c) => cell(r[c.key]))));
  out.push(line("└", "┴", "┘"));
  return out.join("\n");
}

export function defaultWidth() {
  return process.stdout.isTTY && process.stdout.columns ? process.stdout.columns : 160;
}

export const indent = (s, n = 2) => s.split("\n").map((l) => " ".repeat(n) + l).join("\n");

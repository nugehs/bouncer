export const designPrint = [
  "bouncer",
  "+------------------------------------------------------+",
  "| Checks the controls a regulation requires actually   |",
  "| exist in your code. No LLM required.                 |",
  "+--------------------------.---------------------------+",
  "                           |",
  "              .------------+------------.",
  "             /   regulation -> rules     \\",
  "            /_____________________________\\",
  "                 o----o----o----o",
  "                pack  rule surface verdict",
  "                 |    |    |    |",
  "               OSA  AADC  code  pass/fail",
].join("\n");

// Verdict glyphs reused across reporters.
export const GLYPH = {
  pass: "✓", // ✓
  fail: "✗", // ✗
  unknown: "?",
};

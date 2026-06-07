import fs from "node:fs";
import path from "node:path";
import { CONFIG_TEMPLATE } from "./config.js";

/** Write a starter bouncer.config.json into `dir` (default cwd). Never overwrites without --force. */
export function initProject(dir = ".", { force = false } = {}) {
  const target = path.resolve(dir, "bouncer.config.json");
  if (fs.existsSync(target) && !force) {
    return { created: false, path: target, reason: "exists (use --force to overwrite)" };
  }
  fs.writeFileSync(target, JSON.stringify(CONFIG_TEMPLATE, null, 2) + "\n");
  return { created: true, path: target };
}

export function formatInitSummary(result) {
  if (result.created) {
    return `\n  ✓ wrote ${result.path}\n\n  Next:\n    bouncer check\n    bouncer report --out bouncer-report.html\n`;
  }
  return `\n  • ${result.path} already ${result.reason}\n`;
}

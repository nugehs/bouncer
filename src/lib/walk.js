import fs from "node:fs";
import path from "node:path";

const SKIP = new Set([
  "node_modules",
  "dist",
  ".git",
  ".next",
  "coverage",
  ".worktrees",
  ".yarn",
  "build",
  "out",
]);

/**
 * Recursively collect files under `dir` whose basename passes `filter`.
 * Returns absolute paths. Missing directories are skipped silently.
 */
export function walk(dir, filter = () => true) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      out.push(...walk(full, filter));
    } else if (entry.isFile() && filter(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Expand a single level of brace alternation: "a.{ts,tsx}" -> ["a.ts", "a.tsx"].
 * Recurses so multiple brace groups in one pattern all expand.
 */
export function expandBraces(pattern) {
  const open = pattern.indexOf("{");
  if (open === -1) return [pattern];
  const close = pattern.indexOf("}", open);
  if (close === -1) return [pattern];
  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  const options = pattern.slice(open + 1, close).split(",");
  const out = [];
  for (const option of options) {
    for (const expanded of expandBraces(head + option + tail)) {
      out.push(expanded);
    }
  }
  return out;
}

/** Translate a glob (supports **, *, ?, and brace groups) into a RegExp anchored to the whole path. */
export function globToRegExp(glob) {
  let re = "^";
  for (let i = 0; i < glob.length; ) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 3;
      } else {
        re += ".*";
        i += 2;
      }
    } else if (c === "*") {
      re += "[^/]*";
      i += 1;
    } else if (c === "?") {
      re += "[^/]";
      i += 1;
    } else if ("\\^$.|+()[]{}".includes(c)) {
      re += "\\" + c;
      i += 1;
    } else {
      re += c;
      i += 1;
    }
  }
  return new RegExp(re + "$");
}

/** True when `relPath` matches any of the provided globs (brace groups expanded first). */
export function matchesAnyGlob(relPath, globs) {
  for (const glob of globs) {
    for (const expanded of expandBraces(glob)) {
      if (globToRegExp(expanded).test(relPath)) return true;
    }
  }
  return false;
}

/** Line number (1-based) of a character offset within text. */
export function lineAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

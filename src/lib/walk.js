import fs from "node:fs";
import path from "node:path";

// Dependency, build, and tool directories across ecosystems. Hidden directories
// (.git, .next, .venv, .gradle, …) are always skipped.
export const SKIP_DIRS = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  "vendor",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  "bin",
  "obj",
  "venv",
  "site-packages",
  "__pycache__",
  "Pods",
  "DerivedData",
  "_build",
  "deps",
]);

/**
 * Collect files under `dir` whose basename passes `filter`. Iterative (no deep
 * recursion), skips hidden entries and SKIP_DIRS, returns sorted absolute paths.
 * Missing directories yield [].
 */
export function walk(dir, filter = () => true) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile() && filter(entry.name)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

/**
 * Expand brace alternation: "a.{ts,tsx}" -> ["a.ts", "a.tsx"].
 * Recurses so multiple brace groups in one pattern all expand.
 */
export function expandBraces(pattern) {
  const open = pattern.indexOf("{");
  if (open === -1) return [pattern];
  const close = pattern.indexOf("}", open);
  if (close === -1) return [pattern];
  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  const out = [];
  for (const option of pattern.slice(open + 1, close).split(",")) {
    out.push(...expandBraces(head + option + tail));
  }
  return out;
}

/** Translate a glob (supports **, *, ?) into a RegExp anchored to the whole path. */
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

const compiled = new Map();
function compileGlob(glob) {
  let list = compiled.get(glob);
  if (!list) {
    list = expandBraces(glob).map(globToRegExp);
    compiled.set(glob, list);
  }
  return list;
}

/** True when `relPath` matches any of the provided globs (brace groups expanded). */
export function matchesAnyGlob(relPath, globs) {
  for (const glob of globs) {
    for (const re of compileGlob(glob)) if (re.test(relPath)) return true;
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

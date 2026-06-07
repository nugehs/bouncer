import fs from "node:fs";
import path from "node:path";
import { walk, matchesAnyGlob } from "./walk.js";
import * as nextAdapter from "./adapters/next.js";
import * as reactNativeAdapter from "./adapters/react-native.js";

const ADAPTERS = {
  next: nextAdapter,
  "react-native": reactNativeAdapter,
};

const MAX_HITS_PER_RULE = 8;

/**
 * Build a scan context for a target repo: the list of relative source paths plus a
 * lazy, cached file reader. Shared across every rule so the repo is walked once.
 */
function buildContext(cfg) {
  const adapter = ADAPTERS[cfg.target.adapter];
  if (!adapter) throw new Error(`Unknown target adapter: ${cfg.target.adapter}`);

  const root = cfg.target.repoRoot;
  const exts = new Set(adapter.SOURCE_EXT);
  const roots = cfg.target.roots && cfg.target.roots.length ? cfg.target.roots : ["."];

  const files = [];
  const seen = new Set();
  for (const r of roots) {
    const base = path.resolve(root, r);
    for (const abs of walk(base, (name) => extOk(name, exts))) {
      if (seen.has(abs)) continue;
      seen.add(abs);
      files.push({ abs, rel: path.relative(root, abs).split(path.sep).join("/") });
    }
  }

  const cache = new Map();
  const readFile = (abs) => {
    if (cache.has(abs)) return cache.get(abs);
    let text = "";
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      text = "";
    }
    cache.set(abs, text);
    return text;
  };

  return { adapter, files, readFile, root };
}

function extOk(name, exts) {
  // governance artifacts may be .md/.mdx/.pdf — allow anything; ext-filtering is a
  // soft optimisation, surface globs do the real narrowing.
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  const ext = name.slice(dot);
  return exts.has(ext) || [".md", ".mdx", ".json", ".yml", ".yaml", ".pdf"].includes(ext);
}

/**
 * Evaluate one assertion node.
 * Returns { ok, hits, scanned } where `scanned` is how many files the node looked at
 * (0 => the surface could not be located => the rule is "unknown", not a pass).
 */
function evalNode(node, ctx) {
  if (!node || typeof node !== "object") {
    throw new Error(`Invalid assertion node: ${JSON.stringify(node)}`);
  }

  if (Array.isArray(node.allOf)) {
    const parts = node.allOf.map((n) => evalNode(n, ctx));
    return {
      ok: parts.every((p) => p.ok),
      hits: parts.flatMap((p) => p.hits),
      scanned: parts.reduce((a, p) => a + p.scanned, 0),
    };
  }

  if (Array.isArray(node.anyOf)) {
    const parts = node.anyOf.map((n) => evalNode(n, ctx));
    return {
      ok: parts.some((p) => p.ok),
      hits: parts.filter((p) => p.ok).flatMap((p) => p.hits),
      scanned: parts.reduce((a, p) => a + p.scanned, 0),
    };
  }

  if (node.not) {
    const r = evalNode(node.not, ctx);
    return { ok: !r.ok, hits: r.hits, scanned: r.scanned };
  }

  if (typeof node.find === "string") {
    return evalFind(node, ctx);
  }

  if (Array.isArray(node.allInFile)) {
    return evalAllInFile(node, ctx);
  }

  throw new Error(`Assertion node has no allOf/anyOf/not/find/allInFile: ${JSON.stringify(node)}`);
}

function evalFind(node, ctx) {
  const globs = ctx.adapter.resolveSurface(node.in ?? "any");
  const expect = node.expect === "absent" ? "absent" : "present";
  let regex;
  try {
    regex = new RegExp(node.find, node.flags || "i");
  } catch (error) {
    throw new Error(`Bad regex in rule (find: ${node.find}): ${error.message}`);
  }

  const matchedFiles = ctx.files.filter((f) => matchesAnyGlob(f.rel, globs));
  const hits = [];
  for (const f of matchedFiles) {
    const text = ctx.readFile(f.abs);
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        hits.push({ file: f.rel, line: i + 1, excerpt: lines[i].trim().slice(0, 160) });
        if (hits.length >= MAX_HITS_PER_RULE) break;
      }
    }
    if (hits.length >= MAX_HITS_PER_RULE) break;
  }

  const present = hits.length > 0;
  const ok = expect === "absent" ? !present : present;
  return { ok, hits, scanned: matchedFiles.length };
}

// Stronger probe: every pattern must co-occur in a SINGLE file — and, when
// `within` is set, within a window of that many lines of each other (i.e. the same
// settings block / object literal). The window is what makes this meaningfully
// more precise than "all appear somewhere in a big file".
function evalAllInFile(node, ctx) {
  const globs = ctx.adapter.resolveSurface(node.in ?? "any");
  const expect = node.expect === "absent" ? "absent" : "present";
  const within = Number.isFinite(node.within) ? node.within : null;
  let regexes;
  try {
    regexes = node.allInFile.map((p) => new RegExp(p, node.flags || "i"));
  } catch (error) {
    throw new Error(`Bad regex in rule (allInFile): ${error.message}`);
  }

  const matchedFiles = ctx.files.filter((f) => matchesAnyGlob(f.rel, globs));
  let satisfied = false;
  const hits = [];
  for (const f of matchedFiles) {
    const text = ctx.readFile(f.abs);
    const lines = text.split("\n");
    // For each pattern, the set of line numbers (0-based) it matches.
    const perPattern = regexes.map((re) => {
      const ls = [];
      for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) ls.push(i);
      return ls;
    });
    if (perPattern.some((ls) => ls.length === 0)) continue; // a pattern is absent → file can't satisfy

    const anchor = findWindow(perPattern, within);
    if (anchor) {
      satisfied = true;
      for (let p = 0; p < regexes.length; p++) {
        const ln = anchor[p];
        hits.push({ file: f.rel, line: ln + 1, excerpt: lines[ln].trim().slice(0, 160) });
      }
      break;
    }
  }

  const ok = expect === "absent" ? !satisfied : satisfied;
  return { ok, hits: hits.slice(0, MAX_HITS_PER_RULE), scanned: matchedFiles.length };
}

// Find one matching line per pattern such that max-min <= within. With no window,
// any combination works (first match of each). Returns the chosen line per pattern.
function findWindow(perPattern, within) {
  if (within == null) return perPattern.map((ls) => ls[0]);
  // Anchor on each match of the first pattern; require every other pattern to have
  // a match inside [anchor - within, anchor + within].
  for (const anchor of perPattern[0]) {
    const chosen = [anchor];
    let ok = true;
    for (let p = 1; p < perPattern.length; p++) {
      const near = perPattern[p].find((ln) => Math.abs(ln - anchor) <= within);
      if (near === undefined) {
        ok = false;
        break;
      }
      chosen.push(near);
    }
    if (ok) return chosen;
  }
  return null;
}

/** Evaluate a single rule into a finding. */
export function evalRule(rule, ctx, packMeta) {
  const r = evalNode(rule.assert, ctx);
  let status;
  if (r.scanned === 0) status = "unknown";
  else status = r.ok ? "pass" : "fail";

  return {
    packId: packMeta.id,
    packTitle: packMeta.title,
    authority: packMeta.authority,
    ruleId: rule.id,
    standard: rule.standard,
    severity: rule.severity || "medium",
    surface: surfaceLabel(rule.surface ?? rule.assert),
    intent: rule.intent,
    fix: rule.fix,
    status,
    scanned: r.scanned,
    hits: r.hits.slice(0, MAX_HITS_PER_RULE),
  };
}

function surfaceLabel(spec) {
  if (typeof spec === "string") return spec;
  return undefined;
}

export { buildContext };

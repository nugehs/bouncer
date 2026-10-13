import fs from "node:fs";
import path from "node:path";
import { walk, matchesAnyGlob, lineAt } from "./walk.js";
import { getAdapter } from "./adapters/index.js";
import { SURFACES, nameRuns, looksLikeGlob } from "./surfaces.js";
import { classify } from "./languages.js";
import { stripComments } from "./strip.js";
import { DEFAULT_EXCLUDES, DEFAULT_DOCS } from "./config.js";
import { compileRegex } from "./pack-schema.js";

const MAX_HITS_PER_RULE = 8;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export class ScanError extends Error {}

/**
 * Build a scan context: the classified file list plus a lazy, cached reader that
 * returns comment-stripped text. Shared by every rule so the repo is walked once.
 */
export function buildContext(cfg, { allowEmpty = false } = {}) {
  const t = cfg.target || {};
  const adapter = getAdapter(t.adapter || "auto");
  const root = t.repoRoot;
  if (!root || !isDir(root)) throw new ScanError(`Target repo not found: ${root} (check target.repo in your config).`);

  const langs = t.languages && t.languages.length ? new Set(t.languages) : adapter.languages ? new Set(adapter.languages) : null;
  const excludes = [...(cfg.defaultExcludes === false ? [] : DEFAULT_EXCLUDES), ...(cfg.exclude || [])];
  const roots = t.roots && t.roots.length ? t.roots : ["."];
  const docs = cfg.docs || DEFAULT_DOCS;

  const files = [];
  const seen = new Set();
  const missingRoots = [];
  let excluded = 0;
  const languages = {};

  const add = (abs, onlyNonCode) => {
    if (seen.has(abs)) return;
    const rel = path.relative(root, abs).split(path.sep).join("/");
    const info = classify(rel);
    if (!info) return;
    if (onlyNonCode && info.kind === "code") return;
    if (info.kind === "code" && langs && !langs.has(info.lang)) return;
    seen.add(abs);
    if (matchesAnyGlob(rel, excludes)) {
      excluded++;
      return;
    }
    if (info.lang) languages[info.lang] = (languages[info.lang] || 0) + 1;
    files.push({ abs, rel, ...info, runs: nameRuns(rel) });
  };

  for (const r of roots) {
    const base = path.resolve(root, r);
    if (!isDir(base)) {
      missingRoots.push(r);
      continue;
    }
    for (const abs of walk(base)) add(abs, false);
  }
  for (const d of docs) {
    const base = path.resolve(root, d);
    if (isDir(base)) for (const abs of walk(base)) add(abs, true);
  }

  if (!files.length && !allowEmpty) {
    const why = missingRoots.length === roots.length
      ? `none of target.roots exist (${roots.join(", ")})`
      : `no scannable files under ${roots.join(", ")}${missingRoots.length ? ` (missing: ${missingRoots.join(", ")})` : ""}`;
    throw new ScanError(`Nothing to scan in ${root}: ${why}.`);
  }

  const cache = new Map();
  const load = (f) => {
    if (cache.has(f.abs)) return cache.get(f.abs);
    let doc = null;
    if (f.kind !== "binary") {
      try {
        if (fs.statSync(f.abs).size <= MAX_FILE_BYTES) {
          const raw = fs.readFileSync(f.abs, "utf8");
          if (!raw.includes("\u0000")) {
            const rawLines = raw.split("\n");
            const text = stripComments(raw, f.comments);
            doc = { raw: rawLines, text, lines: text.split("\n") };
          }
        }
      } catch {
        doc = null;
      }
    }
    cache.set(f.abs, doc);
    return doc;
  };

  return { adapter, root, files, load, missingRoots, excluded, languages, matchCache: new Map() };
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Resolve a surface spec (alias, glob, or array) into a file predicate. */
export function resolveSurface(spec) {
  const list = Array.isArray(spec) ? spec : [spec ?? "any"];
  if (!list.length) throw new Error(`Surface list must not be empty.`);
  const matchers = list.map((s) => {
    if (typeof s !== "string" || !s) throw new Error(`Invalid surface entry: ${JSON.stringify(s)}`);
    const surface = SURFACES[s];
    if (surface) {
      const names = new Set(surface.names || []);
      const kinds = new Set(surface.kinds);
      const globs = surface.globs || [];
      return (f) => {
        if (globs.length && matchesAnyGlob(f.rel, globs)) return true;
        if (!kinds.has(f.kind)) return false;
        if (surface.all) return true;
        for (const n of names) if (f.runs.has(n)) return true;
        return false;
      };
    }
    if (!looksLikeGlob(s)) throw new Error(`Unknown surface "${s}". Known: ${Object.keys(SURFACES).join(", ")}.`);
    return (f) => matchesAnyGlob(f.rel, [s]);
  });
  return (f) => matchers.some((m) => m(f));
}

function matchFiles(spec, ctx, languages) {
  const key = JSON.stringify([spec ?? "any", languages || null]);
  if (ctx.matchCache.has(key)) return ctx.matchCache.get(key);
  const pred = resolveSurface(spec);
  const langs = languages ? new Set(languages) : null;
  const out = ctx.files.filter((f) => pred(f) && (!langs || f.kind !== "code" || langs.has(f.lang)));
  ctx.matchCache.set(key, out);
  return out;
}

const hit = (f, doc, ln, kind) => ({ file: f.rel, line: ln + 1, excerpt: (doc.raw[ln] || "").trim().slice(0, 160), kind });

/** Evaluate an assertion node -> { ok, hits, scanned, unreadable }. */
function evalNode(node, ctx, rule) {
  if (!node || typeof node !== "object") throw new Error(`Invalid assertion node: ${JSON.stringify(node)}`);

  if (Array.isArray(node.allOf)) {
    const parts = node.allOf.map((n) => evalNode(n, ctx, rule));
    return combine(parts, parts.every((p) => p.ok), parts.flatMap((p) => p.hits));
  }
  if (Array.isArray(node.anyOf)) {
    const parts = node.anyOf.map((n) => evalNode(n, ctx, rule));
    const ok = parts.some((p) => p.ok);
    const hits = ok ? parts.filter((p) => p.ok).flatMap((p) => p.hits) : parts.flatMap((p) => p.hits.filter((h) => h.kind === "violation"));
    return combine(parts, ok, hits);
  }
  if (node.not) {
    const r = evalNode(node.not, ctx, rule);
    const flip = (h) => ({ ...h, kind: h.kind === "violation" ? "evidence" : "violation" });
    return { ...r, ok: !r.ok, hits: r.hits.map(flip) };
  }
  if (typeof node.find === "string") return evalFind(node, ctx, rule);
  if (Array.isArray(node.allInFile)) return evalAllInFile(node, ctx, rule);
  throw new Error(`Assertion node has no allOf/anyOf/not/find/allInFile: ${JSON.stringify(node)}`);
}

function combine(parts, ok, hits) {
  return {
    ok,
    hits,
    scanned: parts.reduce((a, p) => a + p.scanned, 0),
    unreadable: parts.reduce((a, p) => a + p.unreadable, 0),
    langMatched: parts.some((p) => p.langMatched),
  };
}

function evalFind(node, ctx, rule) {
  const expect = node.expect === "absent" ? "absent" : "present";
  let regex;
  try {
    regex = compileRegex(node.find, node.flags);
  } catch (error) {
    throw new Error(`Bad regex in rule (find: ${node.find}): ${error.message}`);
  }
  const files = matchFiles(node.in, ctx, rule.languages);
  const kind = expect === "absent" ? "violation" : "evidence";
  const hits = [];
  let scanned = 0;
  let unreadable = 0;
  for (const f of files) {
    const doc = ctx.load(f);
    if (!doc) {
      unreadable++;
      continue;
    }
    scanned++;
    if (hits.length >= MAX_HITS_PER_RULE) continue;
    if (node.scope === "file") {
      const m = regex.exec(doc.text);
      if (m) hits.push(hit(f, doc, lineAt(doc.text, m.index) - 1, kind));
    } else {
      for (let i = 0; i < doc.lines.length && hits.length < MAX_HITS_PER_RULE; i++) {
        if (regex.test(doc.lines[i])) hits.push(hit(f, doc, i, kind));
      }
    }
  }
  const present = hits.length > 0;
  return { ok: expect === "absent" ? !present : present, hits, scanned, unreadable, langMatched: scanned > 0 };
}

// Every pattern must co-occur in ONE file — within `within` lines of each other when set.
function evalAllInFile(node, ctx, rule) {
  const expect = node.expect === "absent" ? "absent" : "present";
  const within = Number.isFinite(node.within) ? node.within : null;
  let regexes;
  try {
    regexes = node.allInFile.map((p) => compileRegex(p, node.flags));
  } catch (error) {
    throw new Error(`Bad regex in rule (allInFile): ${error.message}`);
  }
  const files = matchFiles(node.in, ctx, rule.languages);
  const kind = expect === "absent" ? "violation" : "evidence";
  let satisfied = false;
  const hits = [];
  let scanned = 0;
  let unreadable = 0;
  for (const f of files) {
    const doc = ctx.load(f);
    if (!doc) {
      unreadable++;
      continue;
    }
    scanned++;
    if (satisfied) continue;
    const per = regexes.map((re) => {
      const ls = [];
      for (let i = 0; i < doc.lines.length; i++) if (re.test(doc.lines[i])) ls.push(i);
      return ls;
    });
    if (per.some((ls) => !ls.length)) continue;
    const anchor = findWindow(per, within);
    if (anchor) {
      satisfied = true;
      for (const ln of anchor) hits.push(hit(f, doc, ln, kind));
    }
  }
  return { ok: expect === "absent" ? !satisfied : satisfied, hits: hits.slice(0, MAX_HITS_PER_RULE), scanned, unreadable, langMatched: scanned > 0 };
}

function findWindow(per, within) {
  if (within == null) return per.map((ls) => ls[0]);
  for (const anchor of per[0]) {
    const chosen = [anchor];
    let ok = true;
    for (let p = 1; p < per.length; p++) {
      const near = per[p].find((ln) => Math.abs(ln - anchor) <= within);
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
export function evalRule(rule, ctx, packMeta = {}) {
  let status;
  let reason;
  let r = { ok: false, hits: [], scanned: 0, unreadable: 0 };

  const pre = rule.appliesWhen ? evalNode(rule.appliesWhen, ctx, {}) : null;
  if (pre && (!pre.ok || pre.scanned === 0)) {
    status = "unknown";
    reason = "precondition-not-met";
  } else {
    r = evalNode(rule.assert, ctx, rule);
    if (r.scanned === 0) {
      status = "unknown";
      reason = r.unreadable > 0 ? "unreadable-only" : rule.languages && !hasLanguage(ctx, rule.languages) ? "language-not-present" : "surface-not-located";
    } else status = r.ok ? "pass" : "fail";
  }

  const finding = {
    packId: packMeta.id,
    packTitle: packMeta.title,
    authority: packMeta.authority,
    ruleId: rule.id,
    standard: rule.standard,
    severity: rule.severity || "medium",
    surface: surfaceLabel(rule),
    intent: rule.intent,
    fix: rule.fix,
    status,
    scanned: r.scanned,
    unreadable: r.unreadable,
    hits: (status === "pass" ? r.hits.filter((h) => h.kind === "evidence") : status === "fail" ? r.hits.filter((h) => h.kind === "violation") : []).slice(0, MAX_HITS_PER_RULE),
  };
  if (reason) finding.reason = reason;
  return finding;
}

function hasLanguage(ctx, langs) {
  return langs.some((l) => ctx.languages[l] > 0);
}

function surfaceLabel(rule) {
  if (typeof rule.surface === "string") return rule.surface;
  const names = new Set();
  const visit = (n) => {
    if (!n || typeof n !== "object") return;
    for (const k of ["allOf", "anyOf"]) if (Array.isArray(n[k])) n[k].forEach(visit);
    if (n.not) visit(n.not);
    if (n.find !== undefined || n.allInFile) {
      for (const s of [].concat(n.in ?? "any")) names.add(SURFACES[s] ? s : "custom");
    }
  };
  visit(rule.assert);
  return names.size ? [...names].join(",") : undefined;
}

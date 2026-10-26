import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContext, evalRule } from "./engine.js";
import { validatePack } from "./pack-schema.js";
import { SURFACES } from "./surfaces.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const BUILTIN_DIR = path.resolve(here, "../packs");

/** Scan pack dirs -> { byId: Map<id, pack[]>, errors: string[] }. Never throws on a bad file. */
function scanPacks(extraDirs = []) {
  const byId = new Map();
  const errors = [];
  for (const dir of [BUILTIN_DIR, ...extraDirs]) {
    let entries;
    try {
      entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    } catch {
      if (dir !== BUILTIN_DIR) errors.push(`Pack directory not found: ${dir}`);
      continue;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry);
      let pack;
      try {
        pack = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (e) {
        errors.push(`Invalid pack JSON ${file}: ${e.message}`);
        continue;
      }
      const problems = validatePack(pack);
      if (problems.length) {
        errors.push(`Invalid pack ${file}:\n  - ${problems.join("\n  - ")}`);
        continue;
      }
      pack._file = file;
      pack._builtin = dir === BUILTIN_DIR;
      if (!byId.has(pack.id)) byId.set(pack.id, []);
      byId.get(pack.id).push(pack);
    }
  }
  for (const [id, list] of byId) {
    if (list.length > 1) errors.push(`Pack id "${id}" is defined more than once: ${list.map((p) => p._file).join(", ")}`);
  }
  return { byId, errors };
}

/** Every pack available (built-in + extraDirs), as metadata. */
export function availablePacks(extraDirs = []) {
  return availablePackIndex(extraDirs).packs;
}

export function availablePackIndex(extraDirs = []) {
  const { byId, errors } = scanPacks(extraDirs);
  const packs = [...byId.values()].map(([p]) => ({
    id: p.id,
    title: p.title,
    authority: p.authority,
    url: p.url,
    rules: p.rules.length,
    builtin: p._builtin,
  }));
  return { packs, errors };
}

/** Resolve configured pack ids. Throws for missing/conflicting requested packs; other problems become warnings. */
export function resolvePacks(cfg) {
  const { byId, errors } = scanPacks(cfg.packDirs || []);
  const wanted = cfg.packs && cfg.packs.length ? cfg.packs : [...byId.keys()];
  const packs = [];
  const fatal = [];
  for (const id of wanted) {
    const list = byId.get(id);
    if (!list) {
      const related = errors.filter((e) => e.includes(id));
      fatal.push(`Pack not found: ${id}.${related.length ? " " + related.join(" ") : " Run `bouncer packs` to list available packs."}`);
    } else if (list.length > 1) {
      fatal.push(`Pack "${id}" is ambiguous — defined in ${list.map((p) => p._file).join(" and ")}. Rename one.`);
    } else packs.push(list[0]);
  }
  if (fatal.length) throw new Error(fatal.join("\n"));

  const owner = new Map();
  for (const p of packs) {
    for (const r of p.rules) {
      if (owner.has(r.id)) throw new Error(`Rule id "${r.id}" appears in both ${owner.get(r.id)} and ${p.id}.`);
      owner.set(r.id, p.id);
    }
  }
  const warnings = errors.filter((e) => !e.startsWith(`Pack id "`) || !wanted.some((w) => e.includes(`"${w}"`)));
  const knownRuleIds = new Set([...byId.values()].flat().flatMap((p) => p.rules.map((r) => r.id)));
  return { packs, warnings, knownRuleIds };
}

export function loadPacks(cfg) {
  return resolvePacks(cfg).packs;
}

/** Run every rule in the configured packs against the target repo. */
export function runCheck(cfg) {
  const ctx = buildContext(cfg);
  const { packs, warnings, knownRuleIds } = resolvePacks(cfg);
  const ignore = new Set(cfg.ignore || []);
  const allWarnings = [...(cfg._warnings || []), ...warnings];
  // Only flag ids no pack defines (likely typos); ids from packs left out by --pack are expected.
  for (const id of ignore) if (!knownRuleIds.has(id)) allWarnings.push(`Ignored rule id "${id}" is not defined by any pack.`);

  const findings = [];
  for (const pack of packs) {
    const meta = { id: pack.id, title: pack.title, authority: pack.authority };
    for (const rule of pack.rules) {
      if (ignore.has(rule.id)) continue;
      findings.push(evalRule(rule, ctx, meta));
    }
  }

  const totals = { pass: 0, fail: 0, unknown: 0 };
  for (const f of findings) totals[f.status] += 1;
  const checked = findings.length;
  const score = checked ? Math.round((totals.pass / checked) * 100) : 100;

  return {
    findings,
    totals,
    score,
    meta: {
      adapter: ctx.adapter.id,
      repo: ctx.root,
      filesScanned: ctx.files.length,
      excluded: ctx.excluded,
      languages: ctx.languages,
      missingRoots: ctx.missingRoots,
      packs: packs.map((p) => ({ id: p.id, title: p.title, authority: p.authority })),
      warnings: allWarnings,
    },
  };
}

/** Flat list of every rule the configured packs would apply (no scanning). */
export function listRules(cfg) {
  const rules = [];
  for (const pack of loadPacks(cfg)) {
    for (const rule of pack.rules) {
      rules.push({
        packId: pack.id,
        ruleId: rule.id,
        standard: rule.standard,
        severity: rule.severity || "medium",
        surface: typeof rule.surface === "string" ? rule.surface : undefined,
        intent: rule.intent,
      });
    }
  }
  return rules;
}

/** Find a single rule and render how it is checked. */
export function explainRule(cfg, ruleId) {
  for (const pack of loadPacks(cfg)) {
    const rule = pack.rules.find((r) => r.id === ruleId);
    if (rule) {
      const checks = renderAssert(rule.assert);
      if (rule.appliesWhen) checks.unshift("ONLY APPLIES WHEN:", ...renderAssert(rule.appliesWhen, 1), "THEN:");
      if (rule.languages) checks.push(`(restricted to languages: ${rule.languages.join(", ")})`);
      return { packId: pack.id, packTitle: pack.title, authority: pack.authority, url: pack.url, ...rule, checks };
    }
  }
  throw new Error(`Rule not found: ${ruleId}. Run \`bouncer list\` to see available rules.`);
}

function where(node) {
  return [].concat(node.in ?? "any").join(", ");
}

function renderAssert(node, depth = 0) {
  const pad = "  ".repeat(depth);
  if (node.allOf) return [`${pad}ALL of:`, ...node.allOf.flatMap((n) => renderAssert(n, depth + 1))];
  if (node.anyOf) return [`${pad}ANY of:`, ...node.anyOf.flatMap((n) => renderAssert(n, depth + 1))];
  if (node.not) return [`${pad}NOT:`, ...renderAssert(node.not, depth + 1)];
  if (node.find) {
    const expect = node.expect === "absent" ? "must NOT appear" : "must appear";
    const scope = node.scope === "file" ? " (may span lines)" : "";
    return [`${pad}- /${node.find}/  ${expect}${scope} in surface [${where(node)}]`];
  }
  if (node.allInFile) {
    const expect = node.expect === "absent" ? "must NOT all co-occur" : "must all co-occur";
    const win = node.within != null ? ` within ${node.within} lines` : "";
    return [`${pad}- all of these patterns ${expect} in a single file${win} in surface [${where(node)}]:`, ...node.allInFile.map((p) => `${pad}    /${p}/`)];
  }
  return [`${pad}- (empty)`];
}

export const KNOWN_SURFACES = Object.keys(SURFACES);

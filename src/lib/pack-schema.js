import { SURFACES, looksLikeGlob } from "./surfaces.js";
import { LANGUAGE_IDS } from "./languages.js";

export const SEVERITIES = ["high", "medium", "low"];
const ALLOWED_FLAGS = new Set(["i", "m", "s", "u"]);

/** Strip stateful flags (g, y) — they make RegExp#test depend on previous calls. */
export function sanitizeFlags(flags) {
  if (flags === undefined) return "i";
  return [...new Set(String(flags).split(""))].filter((f) => ALLOWED_FLAGS.has(f)).join("");
}

export function compileRegex(source, flags) {
  return new RegExp(source, sanitizeFlags(flags));
}

/** Validate a pack object. Returns a list of problems (empty = valid). */
export function validatePack(pack) {
  const problems = [];
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) return ["pack must be a JSON object"];
  if (typeof pack.id !== "string" || !pack.id.trim()) problems.push(`missing string "id"`);
  if (!Array.isArray(pack.rules)) {
    problems.push(`missing "rules" array`);
    return problems;
  }
  const ids = new Set();
  pack.rules.forEach((rule, idx) => {
    const where = rule && typeof rule.id === "string" ? rule.id : `rules[${idx}]`;
    if (!rule || typeof rule !== "object") return problems.push(`${where}: rule must be an object`);
    if (typeof rule.id !== "string" || !rule.id.trim()) problems.push(`${where}: missing string "id"`);
    else if (ids.has(rule.id)) problems.push(`${where}: duplicate rule id`);
    else ids.add(rule.id);
    if (rule.severity !== undefined && !SEVERITIES.includes(rule.severity)) {
      problems.push(`${where}: severity must be one of ${SEVERITIES.join("/")}`);
    }
    if (rule.languages !== undefined) {
      if (!Array.isArray(rule.languages) || !rule.languages.length) problems.push(`${where}: "languages" must be a non-empty array`);
      else for (const l of rule.languages) if (!LANGUAGE_IDS.includes(l)) problems.push(`${where}: unknown language "${l}"`);
    }
    if (rule.assert === undefined) problems.push(`${where}: missing "assert"`);
    else validateNode(rule.assert, `${where}.assert`, problems);
    if (rule.appliesWhen !== undefined) validateNode(rule.appliesWhen, `${where}.appliesWhen`, problems);
  });
  return problems;
}

function validateNode(node, where, problems) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return problems.push(`${where}: assertion must be an object`);
  const kinds = ["allOf", "anyOf", "not", "find", "allInFile"].filter((k) => k in node);
  if (kinds.length !== 1) return problems.push(`${where}: needs exactly one of allOf/anyOf/not/find/allInFile`);
  const kind = kinds[0];
  if (kind === "allOf" || kind === "anyOf") {
    if (!Array.isArray(node[kind]) || !node[kind].length) return problems.push(`${where}.${kind}: must be a non-empty array`);
    node[kind].forEach((n, i) => validateNode(n, `${where}.${kind}[${i}]`, problems));
    return;
  }
  if (kind === "not") return validateNode(node.not, `${where}.not`, problems);

  const patterns = kind === "find" ? [node.find] : node.allInFile;
  if (kind === "allInFile" && (!Array.isArray(patterns) || !patterns.length)) return problems.push(`${where}.allInFile: must be a non-empty array`);
  for (const p of patterns) {
    if (typeof p !== "string" || !p) {
      problems.push(`${where}: patterns must be non-empty strings`);
      continue;
    }
    try {
      compileRegex(p, node.flags);
    } catch (e) {
      problems.push(`${where}: bad regex /${p}/: ${e.message}`);
    }
  }
  if (node.flags !== undefined && /[^gimsuy]/.test(String(node.flags))) problems.push(`${where}: unsupported regex flags "${node.flags}"`);
  if (node.expect !== undefined && node.expect !== "present" && node.expect !== "absent") problems.push(`${where}: expect must be "present" or "absent"`);
  if (node.within !== undefined && (kind !== "allInFile" || !Number.isInteger(node.within) || node.within < 0)) {
    problems.push(`${where}: "within" must be a non-negative integer on allInFile`);
  }
  if (node.scope !== undefined && (kind !== "find" || !["line", "file"].includes(node.scope))) problems.push(`${where}: "scope" must be "line" or "file" on find`);
  if (node.in !== undefined) {
    const list = Array.isArray(node.in) ? node.in : [node.in];
    if (!list.length) problems.push(`${where}.in: must not be empty`);
    for (const s of list) {
      if (typeof s !== "string" || !s) problems.push(`${where}.in: entries must be non-empty strings`);
      else if (!SURFACES[s] && !looksLikeGlob(s)) problems.push(`${where}.in: unknown surface "${s}" (known: ${Object.keys(SURFACES).join(", ")})`);
    }
  }
}

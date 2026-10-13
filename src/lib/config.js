import fs from "node:fs";
import path from "node:path";
import { ADAPTERS } from "./adapters/index.js";
import { LANGUAGE_IDS } from "./languages.js";

// Test, fixture, mock and generated files are never evidence of a production control.
export const DEFAULT_EXCLUDES = [
  "**/{test,tests,__tests__,__mocks__,spec,specs,fixtures,__fixtures__,testdata,mocks,e2e,cypress}/**",
  "**/src/test/**",
  "**/*.{test,spec,stories,story}.*",
  "**/*_test.go",
  "**/test_*.py",
  "**/*_test.py",
  "**/conftest.py",
  "**/*_spec.rb",
  "**/*{Test,Tests,Spec,IT}.{java,kt,scala,cs,groovy}",
  "**/*.d.ts",
  "**/*.min.js",
  "**/*.generated.*",
];

// Governance docs are walked even when `roots` is narrower than the repo.
export const DEFAULT_DOCS = ["docs", "doc", "compliance", "legal", "governance", "policies", "security", "privacy"];

const DEFAULTS = {
  target: { adapter: "auto", repo: ".", roots: ["."] },
  packs: ["uk-osa", "uk-aadc"],
  packDirs: [],
  ignore: [],
  exclude: [],
  docs: DEFAULT_DOCS,
  defaultExcludes: true,
  failOn: ["fail"],
};

const KNOWN_KEYS = new Set(["$schema", "target", "packs", "packDirs", "ignore", "exclude", "docs", "defaultExcludes", "failOn"]);
const TARGET_KEYS = new Set(["adapter", "repo", "roots", "languages"]);
const FAIL_ON = new Set(["fail", "unknown"]);

export class ConfigError extends Error {}

/** Load and resolve bouncer.config.json. The target repo path is resolved relative to the config file. */
export function loadConfig(explicitPath) {
  const cfgPath = path.resolve(explicitPath || findConfig());
  let text;
  try {
    text = fs.readFileSync(cfgPath, "utf8");
  } catch {
    throw new ConfigError(`Config not found: ${cfgPath}`);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`Invalid JSON in ${cfgPath}: ${error.message}`);
  }
  return resolveConfig(raw, path.dirname(cfgPath), cfgPath);
}

/** Validate a raw config object and resolve paths relative to `dir`. */
export function resolveConfig(raw, dir = process.cwd(), cfgPath = undefined) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ConfigError("Config must be a JSON object.");
  const warnings = [];
  for (const k of Object.keys(raw)) if (!KNOWN_KEYS.has(k)) warnings.push(`Unknown config key "${k}" ignored.`);
  const target = raw.target ?? {};
  if (typeof target !== "object" || Array.isArray(target)) throw new ConfigError(`"target" must be an object.`);
  for (const k of Object.keys(target)) if (!TARGET_KEYS.has(k)) warnings.push(`Unknown config key "target.${k}" ignored.`);

  const cfg = { ...DEFAULTS, ...raw, target: { ...DEFAULTS.target, ...target } };
  if (typeof cfg.target.adapter !== "string" || !ADAPTERS[cfg.target.adapter]) {
    throw new ConfigError(`Unknown target.adapter "${cfg.target.adapter}". Known: ${Object.keys(ADAPTERS).join(", ")}.`);
  }
  if (typeof cfg.target.repo !== "string") throw new ConfigError(`"target.repo" must be a string.`);
  stringArray(cfg.target.roots, "target.roots");
  if (cfg.target.languages !== undefined) {
    stringArray(cfg.target.languages, "target.languages");
    for (const l of cfg.target.languages) {
      if (!LANGUAGE_IDS.includes(l)) throw new ConfigError(`Unknown language "${l}" in target.languages. Known: ${LANGUAGE_IDS.join(", ")}.`);
    }
  }
  for (const k of ["packs", "packDirs", "ignore", "exclude", "docs", "failOn"]) stringArray(cfg[k], k);
  for (const k of cfg.failOn) if (!FAIL_ON.has(k)) throw new ConfigError(`"failOn" entries must be "fail" or "unknown" (got "${k}").`);
  if (typeof cfg.defaultExcludes !== "boolean") throw new ConfigError(`"defaultExcludes" must be true or false.`);

  cfg.target.repoRoot = path.resolve(dir, cfg.target.repo);
  cfg.packDirs = cfg.packDirs.map((d) => path.resolve(dir, d));
  cfg._path = cfgPath;
  cfg._warnings = warnings;
  return cfg;
}

function stringArray(v, name) {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new ConfigError(`"${name}" must be an array of strings.`);
}

function findConfig() {
  let dir = process.cwd();
  for (;;) {
    const p = path.join(dir, "bouncer.config.json");
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new ConfigError("No bouncer.config.json found (searched up from cwd). Run `bouncer init` or pass --config <path>.");
}

export const CONFIG_TEMPLATE = {
  target: { adapter: "auto", repo: ".", roots: ["."] },
  packs: ["uk-osa", "uk-aadc"],
  packDirs: [],
  ignore: [],
  exclude: [],
  failOn: ["fail"],
};

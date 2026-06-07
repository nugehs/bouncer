import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  target: { adapter: "next", repo: ".", roots: ["app", "src", "components"] },
  packs: ["uk-osa", "uk-aadc"],
  packDirs: [],
  ignore: [],
  failOn: ["fail"],
};

/** Load and resolve bouncer.config.json. The target repo path is resolved relative to the config file. */
export function loadConfig(explicitPath) {
  const cfgPath = path.resolve(explicitPath || findConfig());
  const dir = path.dirname(cfgPath);
  const raw = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

  const cfg = {
    ...DEFAULTS,
    ...raw,
    target: { ...DEFAULTS.target, ...(raw.target || {}) },
  };
  cfg.target.repoRoot = path.resolve(dir, cfg.target.repo);
  cfg.packDirs = (cfg.packDirs || []).map((d) => path.resolve(dir, d));
  cfg._path = cfgPath;
  return cfg;
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
  throw new Error("No bouncer.config.json found (searched up from cwd). Run `bouncer init` or pass --config <path>.");
}

export const CONFIG_TEMPLATE = {
  target: {
    adapter: "next",
    repo: ".",
    roots: ["app", "src", "components", "redux"],
  },
  packs: ["uk-osa", "uk-aadc"],
  packDirs: [],
  ignore: [],
  failOn: ["fail"],
};

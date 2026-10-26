// Strict, per-command argument parsing. Boolean flags never consume the next
// argument; unknown flags are usage errors (exit 2) instead of being silently ignored.

export class UsageError extends Error {}

const COMMON_BOOL = ["help", "json", "version"];
export const COMMANDS = {
  check: { values: ["config", "pack", "status", "ignore"], bools: ["no_fail"] },
  report: { values: ["config", "pack", "out", "ignore"], bools: [] },
  list: { values: ["config", "pack"], bools: [] },
  explain: { values: ["config", "pack"], bools: [] },
  packs: { values: ["config"], bools: [] },
  init: { values: [], bools: ["force"] },
  doctor: { values: ["config", "pack"], bools: [] },
  mcp: { values: [], bools: [] },
  help: { values: [], bools: [] },
};

const ALIASES = { o: "out", h: "help", j: "json", p: "pack", c: "config", s: "status", v: "version" };
const REPEATABLE = new Set(["pack", "ignore"]);

export function parseArgv(argv) {
  const args = [...argv];
  let command = "check";
  if (args.length && !args[0].startsWith("-")) command = args.shift();
  const result = { command, positionals: [], flags: {} };
  const spec = COMMANDS[command];
  if (!spec) throw new UsageError(`Unknown command: ${command}.`);
  const bools = new Set([...COMMON_BOOL, ...spec.bools]);
  const values = new Set(spec.values);

  const assign = (key, value) => {
    if (REPEATABLE.has(key)) (result.flags[key] ||= []).push(value);
    else result.flags[key] = value;
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      result.positionals.push(...args.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      result.positionals.push(arg);
      continue;
    }
    let names;
    let inline;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const raw = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      inline = eq === -1 ? undefined : arg.slice(eq + 1);
      names = [normalize(raw)];
    } else {
      names = arg.slice(1).split("").map(normalize);
    }
    names.forEach((key, idx) => {
      const last = idx === names.length - 1;
      if (bools.has(key)) {
        if (inline !== undefined) throw new UsageError(`Flag --${dash(key)} does not take a value.`);
        result.flags[key] = true;
      } else if (values.has(key)) {
        let v = inline;
        if (v === undefined && last) {
          const next = args[i + 1];
          if (next !== undefined && !next.startsWith("-")) v = args[++i];
        }
        if (v === undefined || v === "") throw new UsageError(`Flag --${dash(key)} requires a value.`);
        assign(key, v);
      } else {
        throw new UsageError(`Unknown flag for \`${command}\`: ${arg}`);
      }
    });
  }
  return result;
}

function normalize(flag) {
  return ALIASES[flag] ?? flag.replaceAll("-", "_");
}
const dash = (k) => k.replaceAll("_", "-");

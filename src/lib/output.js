import fs from "node:fs";
import path from "node:path";

export function printText(text) {
  process.stdout.write(`${text}\n`);
}

/** Diagnostics and errors always go to stderr so stdout stays machine-clean (JSON, MCP). */
export function printError(text) {
  process.stderr.write(`${text}\n`);
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function writeArtifact(targetPath, contents) {
  const absolutePath = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return { path: absolutePath };
}

export function printHelp() {
  printText(`bouncer — static compliance-controls checker (language-agnostic)

Verifies the controls a regulation requires actually exist in your code,
expressed as deterministic rule packs. Works on any codebase (TS/JS, Go, Java,
Kotlin, Python, Ruby, PHP, C#, Rust, Swift, Dart, …). No LLM required.

Usage:
  bouncer check [--config file] [--pack id...] [--ignore id...] [--status fail|unknown|all] [--json] [--no-fail]
  bouncer report [--config file] [--pack id...] [--out file]   Write a self-contained HTML audit report
  bouncer list [--config file] [--pack id...] [--json]        List every rule the configured packs apply
  bouncer explain <ruleId> [--config file] [--json]           Show what a rule requires and how it is checked
  bouncer packs [--config file] [--json]                      List available rule packs
  bouncer init [path] [--force] [--json]                      Write a starter bouncer.config.json
  bouncer doctor [--config file] [--json]                     Sanity-check config, files, languages, packs
  bouncer mcp                                                 Start the MCP server (stdio)
  bouncer help

Exit codes:
  0  ok    1  gate failed (check) / doctor failed    2  usage, config, or scan error

Verdicts:
  pass     the required control was found (file:line evidence)
  fail     the surface exists, but no evidence of the control was found
  unknown  can't determine (surface not located, unreadable files, or rule not applicable) — not a pass
`);
}

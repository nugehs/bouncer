import fs from "node:fs";
import path from "node:path";

export function printText(text) {
  process.stdout.write(`${text}\n`);
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
  printText(`bouncer — static compliance-controls checker

Verifies the controls a regulation requires actually exist in your code,
expressed as deterministic rule packs. Runs in CI. No LLM required.

Usage:
  bouncer check [--config file] [--pack id...] [--status fail|unknown|all] [--json] [--no-fail]
  bouncer report [--config file] [--out file]      Write a self-contained HTML audit report
  bouncer list [--config file] [--json]            List every rule the configured packs apply
  bouncer explain <ruleId> [--config file]         Show what a rule requires and how it is checked
  bouncer packs [--json]                           List the rule packs shipped with bouncer
  bouncer init [path]                              Write a starter bouncer.config.json
  bouncer doctor [--config file] [--json]          Sanity-check config, adapter, and pack loading
  bouncer mcp                                      Start the MCP server (stdio)
  bouncer help

Examples:
  bouncer init .
  bouncer check
  bouncer check --pack uk-aadc --status fail
  bouncer report --out bouncer-report.html
  bouncer explain aadc.geolocation-default-off
  bouncer packs

Verdicts:
  pass     the required control was found
  fail     the control is required for a surface that exists, but no evidence was found
  unknown  the surface could not be located in this repo (can't determine — not a pass)
`);
}

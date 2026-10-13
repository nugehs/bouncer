#!/usr/bin/env node
import { parseArgv, UsageError } from "./lib/args.js";
import { loadConfig } from "./lib/config.js";
import { runCheck, listRules, explainRule, availablePackIndex } from "./lib/packs.js";
import { reportHuman } from "./lib/reporters/human.js";
import { reportJson } from "./lib/reporters/json.js";
import { reportHtml } from "./lib/reporters/html.js";
import { getDoctorReport, formatDoctorReport } from "./lib/doctor.js";
import { initProject, formatInitSummary } from "./lib/init.js";
import { startMcpServer } from "./lib/mcp.js";
import { printText, printError, printJson, printHelp, writeArtifact } from "./lib/output.js";
import { assertStatusFilter } from "./lib/verdicts.js";
import { renderTable, indent } from "./lib/table.js";

const commandHandlers = {
  check: handleCheck,
  report: handleReport,
  list: handleList,
  explain: handleExplain,
  packs: handlePacks,
  init: handleInit,
  doctor: handleDoctor,
  mcp: handleMcp,
  help: handleHelp,
};

async function main(argv = process.argv.slice(2)) {
  try {
    const parsed = parseArgv(argv);
    if (parsed.flags.help) return handleHelp();
    await commandHandlers[parsed.command](parsed);
  } catch (error) {
    printError(`bouncer: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof UsageError) printError("Run `bouncer help` for usage.");
    process.exitCode = 2;
  }
}

function cfgFrom(parsed) {
  const cfg = loadConfig(parsed.flags.config);
  if (parsed.flags.pack) cfg.packs = [...parsed.flags.pack];
  if (parsed.flags.ignore) cfg.ignore = [...cfg.ignore, ...parsed.flags.ignore];
  return cfg;
}

function warn(result) {
  for (const w of result.meta.warnings || []) printError(`bouncer: warning: ${w}`);
}

function handleCheck(parsed) {
  const statusFilter = assertStatusFilter(parsed.flags.status || "all");
  const cfg = cfgFrom(parsed);
  const result = runCheck(cfg);
  warn(result);
  if (parsed.flags.json) reportJson(result);
  else reportHuman(result, { statusFilter });
  if (!parsed.flags.no_fail && cfg.failOn.some((k) => (result.totals[k] || 0) > 0)) process.exitCode = 1;
}

function handleReport(parsed) {
  const result = runCheck(cfgFrom(parsed));
  warn(result);
  const html = reportHtml(result, { generatedAt: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC" });
  const { path: written } = writeArtifact(parsed.flags.out || "bouncer-report.html", html);
  printText(`\n  📄 HTML report written to ${written}\n`);
}

function handleList(parsed) {
  const rules = listRules(cfgFrom(parsed));
  if (parsed.flags.json) return printJson({ rules });
  printText("");
  printText(indent(renderTable(
    [
      { key: "packId", label: "Pack" },
      { key: "severity", label: "Severity" },
      { key: "ruleId", label: "Rule" },
      { key: "standard", label: "Standard", flex: true },
    ],
    rules,
  )));
  printText(`\n  ${rules.length} rules\n`);
}

function handleExplain(parsed) {
  const ruleId = parsed.positionals[0];
  if (!ruleId) throw new UsageError("usage: bouncer explain <ruleId>");
  const r = explainRule(cfgFrom(parsed), ruleId);
  if (parsed.flags.json) return printJson(r);
  printText("");
  printText(indent(renderTable(
    [{ key: "k", label: "Field" }, { key: "v", label: "Value", flex: true }],
    [
      { k: "rule", v: r.id },
      { k: "pack", v: `${r.packTitle} (${r.packId})` },
      { k: "authority", v: r.authority },
      { k: "standard", v: r.standard },
      { k: "severity", v: r.severity || "medium" },
      { k: "intent", v: r.intent },
      { k: "fix", v: r.fix },
      ...(r.url ? [{ k: "reference", v: r.url }] : []),
    ],
  )));
  printText(`\n  how it is checked:`);
  for (const line of r.checks) printText(`    ${line}`);
  printText("");
}

function handlePacks(parsed) {
  const dirs = parsed.flags.config ? loadConfig(parsed.flags.config).packDirs : [];
  const { packs, errors } = availablePackIndex(dirs);
  for (const e of errors) printError(`bouncer: warning: ${e}`);
  if (parsed.flags.json) return printJson({ packs });
  printText("");
  printText(indent(renderTable(
    [
      { key: "id", label: "Pack" },
      { key: "rules", label: "Rules", align: "right" },
      { key: "title", label: "Title", flex: true },
      { key: "authority", label: "Authority", flex: true },
      { key: "src", label: "Source" },
    ],
    packs.map((p) => ({ ...p, src: p.builtin ? "built-in" : "local" })),
  )));
  printText("");
}

function handleInit(parsed) {
  const result = initProject(parsed.positionals[0] || ".", { force: !!parsed.flags.force });
  if (parsed.flags.json) return printJson(result);
  printText(formatInitSummary(result));
}

function handleDoctor(parsed) {
  const report = getDoctorReport(cfgFrom(parsed));
  if (parsed.flags.json) printJson(report);
  else printText(formatDoctorReport(report));
  if (!report.ok) process.exitCode = 1;
}

async function handleMcp() {
  await startMcpServer();
}

function handleHelp() {
  printHelp();
}

main();

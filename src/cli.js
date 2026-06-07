#!/usr/bin/env node
import { parseArgv } from "./lib/args.js";
import { loadConfig } from "./lib/config.js";
import { runCheck, listRules, explainRule, availablePacks } from "./lib/packs.js";
import { reportHuman } from "./lib/reporters/human.js";
import { reportJson } from "./lib/reporters/json.js";
import { reportHtml } from "./lib/reporters/html.js";
import { getDoctorReport, formatDoctorReport } from "./lib/doctor.js";
import { initProject, formatInitSummary } from "./lib/init.js";
import { startMcpServer } from "./lib/mcp.js";
import { printText, printJson, printHelp, writeArtifact } from "./lib/output.js";

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
  const parsed = parseArgv(argv);
  const command = parsed.command ?? "check";
  const handler = commandHandlers[command];

  if (!handler || parsed.flags.help) {
    handleHelp();
    process.exitCode = handler ? 0 : 1;
    return;
  }

  try {
    await handler(parsed);
  } catch (error) {
    printText(`bouncer: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

function cfgFrom(parsed) {
  const cfg = loadConfig(parsed.flags.config);
  if (parsed.flags.pack) cfg.packs = [].concat(parsed.flags.pack);
  return cfg;
}

function handleCheck(parsed) {
  const cfg = cfgFrom(parsed);
  const result = runCheck(cfg);

  if (parsed.flags.json) reportJson(result);
  else reportHuman(result, { statusFilter: parsed.flags.status || "all" });

  if (!parsed.flags.no_fail) {
    const failing = (cfg.failOn || ["fail"]).some((k) => (result.totals[k] || 0) > 0);
    if (failing) process.exitCode = 1;
  }
}

function handleReport(parsed) {
  const cfg = cfgFrom(parsed);
  const result = runCheck(cfg);
  const out = parsed.flags.out || "bouncer-report.html";
  const html = reportHtml(result, {
    generatedAt: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
  });
  const { path: written } = writeArtifact(out, html);
  printText(`\n  📄 HTML report written to ${written}\n`);
}

function handleList(parsed) {
  const rules = listRules(cfgFrom(parsed));
  if (parsed.flags.json) return printJson({ rules });
  printText("");
  for (const r of rules) {
    printText(`  ${pad(r.severity, 6)} ${pad(r.ruleId, 38)} ${r.standard || ""}`);
  }
  printText(`\n  ${rules.length} rules\n`);
}

function handleExplain(parsed) {
  const ruleId = parsed.positionals[0];
  if (!ruleId) throw new Error("usage: bouncer explain <ruleId>");
  const r = explainRule(cfgFrom(parsed), ruleId);
  if (parsed.flags.json) return printJson(r);
  printText("");
  printText(`  ${r.id}`);
  printText(`  pack:     ${r.packTitle} (${r.packId})`);
  printText(`  authority:${r.authority || ""}`);
  printText(`  standard: ${r.standard || ""}`);
  printText(`  severity: ${r.severity || "medium"}`);
  printText("");
  printText(`  intent:   ${r.intent || ""}`);
  printText(`  fix:      ${r.fix || ""}`);
  printText("");
  printText(`  how it is checked:`);
  for (const line of r.checks) printText(`    ${line}`);
  if (r.url) printText(`\n  reference: ${r.url}`);
  printText("");
}

function handlePacks(parsed) {
  const dirs = parsed.flags.config ? loadConfig(parsed.flags.config).packDirs : [];
  const packs = availablePacks(dirs);
  if (parsed.flags.json) return printJson({ packs });
  printText("");
  for (const p of packs) {
    printText(`  ${pad(p.id, 12)} ${pad(String(p.rules) + " rules", 10)} ${p.title}`);
    printText(`  ${" ".repeat(12)} ${" ".repeat(10)} ${p.authority || ""}`);
  }
  printText("");
}

function handleInit(parsed) {
  const result = initProject(parsed.positionals[0] || ".", { force: !!parsed.flags.force });
  if (parsed.flags.json) return printJson(result);
  printText(formatInitSummary(result));
}

function handleDoctor(parsed) {
  const cfg = cfgFrom(parsed);
  const report = getDoctorReport(cfg);
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

function pad(s, n) {
  return String(s || "").padEnd(n);
}

main();

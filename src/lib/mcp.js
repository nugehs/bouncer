import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { runCheck, listRules, explainRule, availablePacks } from "./packs.js";

const protocolVersion = "2025-06-18";
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));

const tools = [
  {
    name: "compliance_check",
    title: "Compliance Controls Check",
    description:
      "Run the configured regulation rule packs against the target repo and return per-control verdicts (pass/fail/unknown) with file-level evidence. Deterministic; no LLM involved.",
    inputSchema: {
      type: "object",
      properties: {
        config: { type: "string", description: "Path to bouncer.config.json. Defaults to searching up from cwd." },
        packs: { type: "array", items: { type: "string" }, description: "Restrict to these pack ids (e.g. uk-osa, uk-aadc)." },
        status: { type: "string", description: "Filter findings: fail, unknown, or all (default)." },
      },
    },
  },
  {
    name: "list_rules",
    title: "List Compliance Rules",
    description: "List every rule the configured packs apply, with standard, severity, and surface. No scanning.",
    inputSchema: {
      type: "object",
      properties: {
        config: { type: "string", description: "Path to bouncer.config.json." },
      },
    },
  },
  {
    name: "explain_rule",
    title: "Explain Compliance Rule",
    description: "Explain a single rule: the legal standard, intent, fix, and exactly how bouncer checks it.",
    inputSchema: {
      type: "object",
      properties: {
        ruleId: { type: "string", description: "Rule id, e.g. aadc.geolocation-default-off." },
        config: { type: "string", description: "Path to bouncer.config.json." },
      },
      required: ["ruleId"],
    },
  },
  {
    name: "list_packs",
    title: "List Rule Packs",
    description: "List the regulation rule packs bundled with bouncer (and any local pack dirs).",
    inputSchema: {
      type: "object",
      properties: {
        config: { type: "string", description: "Optional bouncer.config.json to include its packDirs." },
      },
    },
  },
];

export async function startMcpServer({ input = process.stdin, output = process.stdout } = {}) {
  // A client that hangs up mid-write produces EPIPE; exit quietly rather than crash-logging.
  output.on("error", (err) => {
    if (err && err.code === "EPIPE") process.exit(0);
    throw err;
  });

  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      writeMessage(output, errorResponse(null, -32700, `Parse error: ${error.message}`));
      continue;
    }

    const response = await handleMessage(message);
    if (response) writeMessage(output, response);
  }
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return errorResponse(message?.id ?? null, -32600, "Invalid JSON-RPC request");
  }

  try {
    switch (message.method) {
      case "initialize":
        return successResponse(message.id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: packageJson.name, version: packageJson.version },
        });
      case "notifications/initialized":
        return undefined;
      case "ping":
        return successResponse(message.id, {});
      case "tools/list":
        return successResponse(message.id, { tools });
      case "tools/call":
        return successResponse(message.id, await callTool(message.params));
      default:
        return errorResponse(message.id, -32601, `Method not found: ${message.method}`);
    }
  } catch (error) {
    const code = error instanceof McpProtocolError ? error.code : -32603;
    return errorResponse(message.id, code, error instanceof Error ? error.message : String(error));
  }
}

async function callTool(params = {}) {
  if (!params || typeof params !== "object") throw new McpProtocolError(-32602, "Tool call params must be an object");
  const name = params.name;
  if (typeof name !== "string" || !name.trim()) throw new McpProtocolError(-32602, "Tool name is required");
  const args = params.arguments ?? {};
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new McpProtocolError(-32602, "Tool arguments must be an object");
  }

  let result;
  try {
    result = dispatchTool(name, args);
  } catch (error) {
    if (error instanceof McpProtocolError) throw error;
    return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
    isError: false,
  };
}

function dispatchTool(name, args) {
  switch (name) {
    case "compliance_check": {
      const cfg = withPacks(loadConfig(args.config), args.packs);
      const result = runCheck(cfg);
      const filter = args.status || "all";
      if (filter !== "all") {
        result.findings = result.findings.filter((f) => (filter === "fail" ? f.status === "fail" : f.status !== "pass"));
      }
      return result;
    }
    case "list_rules":
      return { rules: listRules(loadConfig(args.config)) };
    case "explain_rule":
      return explainRule(loadConfig(args.config), requiredString(args.ruleId, "ruleId"));
    case "list_packs": {
      const dirs = args.config ? loadConfig(args.config).packDirs : [];
      return { packs: availablePacks(dirs) };
    }
    default:
      throw new McpProtocolError(-32601, `Unknown tool: ${name}`);
  }
}

function withPacks(cfg, packs) {
  if (Array.isArray(packs) && packs.length) cfg.packs = packs;
  return cfg;
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new McpProtocolError(-32602, `${label} is required`);
  return value;
}

function successResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function writeMessage(output, message) {
  output.write(JSON.stringify(message) + "\n");
}

class McpProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

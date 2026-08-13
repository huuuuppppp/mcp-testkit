#!/usr/bin/env node
import { runContract } from "./contract.js";

interface ParsedArgs {
  command?: string;
  commandArgs: string[];
  cwd?: string;
  calls: Record<string, unknown>;
  timeoutMs: number;
  help: boolean;
  version: boolean;
}

const HELP = `mcp-testkit — testing toolkit for MCP servers

USAGE
  mcp-testkit contract <command> [args...] [options]

COMMANDS
  contract    Spawn an MCP server over stdio and run a contract smoke test.

OPTIONS (contract)
  --cwd <dir>           Working directory for the spawned server.
  --call <name>=<json>  Call a tool with JSON arguments; repeatable.
  --timeout <ms>        Per-request timeout in milliseconds (default 10000).
  -h, --help            Show this help.
  -v, --version         Show the package version.

EXAMPLES
  mcp-testkit contract node ./dist/server.js
  mcp-testkit contract npx my-mcp-server
  mcp-testkit contract node ./server.js --call ping='{}' \\
    --call add='{"a":1,"b":2}'

EXIT CODES
  0  All contract checks passed.
  1  One or more checks failed.
  2  Invalid usage.
`;

function parseVersion(): string {
  return "0.1.0";
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    commandArgs: [],
    calls: {},
    timeoutMs: 10000,
    help: false,
    version: false,
  };

  const [bin, script, ...rest] = argv;
  void bin;
  void script;

  let mode: "root" | "contract" = "root";
  let i = 0;
  while (i < rest.length) {
    const arg = rest[i] as string;
    if (arg === "contract") {
      mode = "contract";
      i++;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      out.help = true;
      i++;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      out.version = true;
      i++;
      continue;
    }
    if (mode === "contract") {
      if (arg === "--cwd") {
        out.cwd = rest[i + 1];
        i += 2;
        continue;
      }
      if (arg === "--timeout") {
        out.timeoutMs = Number(rest[i + 1]);
        i += 2;
        continue;
      }
      if (arg === "--call") {
        const spec = rest[i + 1] ?? "";
        const eq = spec.indexOf("=");
        if (eq === -1) {
          throw new Error(
            `Invalid --call value "${spec}". Expected name=<json>.`,
          );
        }
        const name = spec.slice(0, eq);
        const json = spec.slice(eq + 1);
        try {
          out.calls[name] = JSON.parse(json);
        } catch {
          throw new Error(`Invalid JSON for --call ${name}: ${json}`);
        }
        i += 2;
        continue;
      }
      if (arg.startsWith("--")) {
        throw new Error(`Unknown option: ${arg}`);
      }
      if (!out.command) {
        out.command = arg;
        i++;
        continue;
      }
      out.commandArgs.push(arg);
      i++;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  return out;
}

function formatResult(result: Awaited<ReturnType<typeof runContract>>): string {
  const lines: string[] = [];
  lines.push("MCP TestKit — contract test");
  lines.push("─".repeat(40));
  if (result.server) {
    lines.push(
      `Server: ${result.server.name}@${result.server.version}`,
    );
  }
  lines.push(
    `Tools: ${result.toolCount}   Resources: ${result.resourceCount}   Prompts: ${result.promptCount}`,
  );
  lines.push("");
  for (const check of result.checks) {
    const mark = check.ok ? "✓" : "✗";
    lines.push(
      `  ${mark} ${check.name.padEnd(16)} ${check.durationMs}ms  ${check.ok ? "" : check.detail}`,
    );
  }
  lines.push("");
  lines.push(result.ok ? "PASS" : "FAIL");
  return lines.join("\n");
}

async function main(): Promise<void> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${HELP}`);
    process.exit(2);
  }

  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  if (parsed.version) {
    process.stdout.write(`${parseVersion()}\n`);
    return;
  }
  if (!parsed.command) {
    process.stderr.write(`Error: a command is required.\n\n${HELP}`);
    process.exit(2);
  }

  const result = await runContract({
    command: parsed.command,
    args: parsed.commandArgs,
    cwd: parsed.cwd,
    calls: parsed.calls,
    timeoutMs: parsed.timeoutMs,
  });

  process.stdout.write(`${formatResult(result)}\n`);
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`mcp-testkit: ${(err as Error).message}\n`);
  process.exit(1);
});

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";

/** A single check executed as part of a contract test. */
export interface ContractCheck {
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
}

/** The result of running a contract test against a server. */
export interface ContractResult {
  ok: boolean;
  server: Implementation | undefined;
  checks: ContractCheck[];
  toolCount: number;
  resourceCount: number;
  promptCount: number;
  error?: string;
}

export interface ContractOptions {
  /** The server command, e.g. `npx` or `node ./dist/server.js`. */
  command: string;
  /** Arguments passed to the command. */
  args?: string[];
  /** Working directory for the spawned process. */
  cwd?: string;
  /** Environment variables for the spawned process. */
  env?: Record<string, string>;
  /**
   * A map of `toolName -> JSON-encoded arguments` to smoke-test.
   * Each call must succeed (not return `isError`) to pass the check.
   */
  calls?: Record<string, unknown>;
  /** Per-request timeout in milliseconds. @default 10000 */
  timeoutMs?: number;
  /** Client info advertised during initialize. */
  clientInfo?: Implementation;
}

async function timed<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<[T, ContractCheck]> {
  const started = Date.now();
  try {
    const value = await fn();
    return [
      value,
      {
        name,
        ok: true,
        detail: "ok",
        durationMs: Date.now() - started,
      },
    ];
  } catch (err) {
    return [
      undefined as T,
      {
        name,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started,
      },
    ];
  }
}

/**
 * Run a contract test against a spawned MCP server over stdio.
 *
 * The test verifies that the server initializes, responds to ping, and
 * correctly lists tools/resources/prompts. Optionally, it can invoke named
 * tools with provided arguments and assert they return successfully.
 *
 * This is intended as a fast smoke test for CI, not a substitute for full
 * unit tests (use {@link createTestKit} for those).
 */
export async function runContract(
  options: ContractOptions,
): Promise<ContractResult> {
  const transport = new StdioClientTransport({
    command: options.command,
    args: options.args ?? [],
    cwd: options.cwd,
    env: options.env,
    stderr: "pipe",
  });

  const client = new Client(
    options.clientInfo ?? { name: "mcp-testkit-contract", version: "0.1.0" },
    { capabilities: {} },
  );

  const checks: ContractCheck[] = [];
  let server: Implementation | undefined;

  try {
    const [, initializeCheck] = await timed("initialize", () =>
      client.connect(transport),
    );
    checks.push(initializeCheck);
    if (!initializeCheck.ok) {
      return {
        ok: false,
        server: undefined,
        checks,
        toolCount: 0,
        resourceCount: 0,
        promptCount: 0,
        error: initializeCheck.detail,
      };
    }

    server = client.getServerVersion();

    const [pingResult, pingCheck] = await timed("ping", () => client.ping());
    checks.push(pingCheck);

    const [toolsResult, toolsCheck] = await timed("listTools", () =>
      client.listTools(),
    );
    checks.push(toolsCheck);

    const [resourcesResult, resourcesCheck] = await timed("listResources", () =>
      client.listResources(),
    );
    checks.push(resourcesCheck);

    const [promptsResult, promptsCheck] = await timed("listPrompts", () =>
      client.listPrompts(),
    );
    checks.push(promptsCheck);

    const toolCount = toolsResult?.tools?.length ?? 0;
    const resourceCount = resourcesResult?.resources?.length ?? 0;
    const promptCount = promptsResult?.prompts?.length ?? 0;

    if (options.calls) {
      for (const [name, args] of Object.entries(options.calls)) {
        const [, callCheck] = await timed(`call:${name}`, async () => {
          const result = await client.callTool({
            name,
            arguments: (args ?? {}) as Record<string, unknown>,
          });
          if (result.isError) {
            const content = result.content as Array<{ type: string; text?: string }>;
            const text = content
              .filter((b) => b.type === "text")
              .map((b) => b.text ?? "")
              .join("\n");
            throw new Error(
              `tool "${name}" returned isError: ${text || "(no text)"}`,
            );
          }
          return result;
        });
        checks.push(callCheck);
      }
    }

    const ok = checks.every((c) => c.ok);
    return {
      ok,
      server,
      checks,
      toolCount,
      resourceCount,
      promptCount,
    };
  } catch (err) {
    return {
      ok: false,
      server,
      checks,
      toolCount: 0,
      resourceCount: 0,
      promptCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      await client.close();
    } catch {
      // already closed
    }
  }
}

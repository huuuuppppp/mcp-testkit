import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  CallToolResult,
  ClientCapabilities,
  CompleteResult,
  GetPromptResult,
  Implementation,
  ListPromptsResult,
  ListResourceTemplatesResult,
  ListResourcesResult,
  ListToolsResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { createExpectation, type Expectation } from "./assertions.js";

/**
 * Any MCP server that can be attached to a transport.
 *
 * Both the high-level `McpServer` and the low-level `Server` from
 * `@modelcontextprotocol/sdk` satisfy this interface.
 */
export interface ConnectableServer {
  connect(transport: Transport): Promise<void>;
  close?(): Promise<void>;
}

export interface TestKitOptions {
  /**
   * Client implementation info advertised to the server during the
   * MCP initialize handshake.
   *
   * @default { name: "mcp-testkit", version: "<package version>" }
   */
  clientInfo?: Implementation;
  /**
   * Client capabilities advertised during initialize.
   *
   * @default {}
   */
  clientCapabilities?: ClientCapabilities;
  /**
   * Called once the in-memory transports are created but before either
   * side is connected. Use this to customize transports (for example to
   * inject authentication info).
   */
  setupTransports?(transports: {
    clientTransport: Transport;
    serverTransport: Transport;
  }): void | Promise<void>;
  /**
   * Timeout in milliseconds for initialize/handshake and requests.
   * Passed through to the SDK `Client`.
   */
  timeoutMs?: number;
}

export interface CallToolOptions {
  /** Request timeout in milliseconds. */
  timeout?: number;
}

/**
 * A connected test harness for an MCP server.
 *
 * Obtain one with {@link createTestKit}. The harness wraps an in-memory
 * client/server pair so tests run in a single process with no subprocesses,
 * no stdio, and no network.
 */
export class MCPTestKit {
  readonly client: Client;
  private readonly server: ConnectableServer;
  private readonly clientTransport: Transport;
  private readonly serverTransport: Transport;
  private closed = false;

  private constructor(
    client: Client,
    server: ConnectableServer,
    clientTransport: Transport,
    serverTransport: Transport,
  ) {
    this.client = client;
    this.server = server;
    this.clientTransport = clientTransport;
    this.serverTransport = serverTransport;
  }

  /** @internal Use {@link createTestKit}. */
  static async _connect(
    server: ConnectableServer,
    options: TestKitOptions = {},
  ): Promise<MCPTestKit> {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    if (options.setupTransports) {
      await options.setupTransports({ clientTransport, serverTransport });
    }

    const client = new Client(
      options.clientInfo ?? { name: "mcp-testkit", version: "0.1.0" },
      {
        capabilities: options.clientCapabilities ?? {},
      },
    );

    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    return new MCPTestKit(client, server, clientTransport, serverTransport);
  }

  /** Return the server capabilities reported during initialize. */
  get capabilities() {
    return this.client.getServerCapabilities();
  }

  /** Return the server implementation info reported during initialize. */
  get serverInfo() {
    return this.client.getServerVersion();
  }

  /** Send a ping to the server. */
  ping(timeout?: number) {
    return this.client.ping({ timeout });
  }

  /** List all tools registered on the server. */
  listTools(timeout?: number): Promise<ListToolsResult> {
    return this.client.listTools(undefined, { timeout });
  }

  /**
   * Call a tool by name.
   *
   * @param name - The tool name.
   * @param args - Arguments validated against the tool's input schema.
   */
  callTool(
    name: string,
    args: Record<string, unknown> = {},
    options: CallToolOptions = {},
  ): Promise<CallToolResult> {
    return this.client.callTool(
      { name, arguments: args },
      undefined,
      { timeout: options.timeout },
    ) as Promise<CallToolResult>;
  }

  /** Start a framework-agnostic assertion chain on a tool result. */
  expect(result: CallToolResult): Expectation<CallToolResult> {
    return createExpectation(result);
  }

  /**
   * Call a tool and immediately start an assertion chain.
   *
   * @example
   * ```ts
   * const sum = await kit.expectTool("add", { a: 1, b: 2 });
   * sum.toBeText("3");
   * ```
   */
  async expectTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<Expectation<CallToolResult>> {
    return createExpectation(await this.callTool(name, args));
  }

  /** List all resources registered on the server. */
  listResources(timeout?: number): Promise<ListResourcesResult> {
    return this.client.listResources(undefined, { timeout });
  }

  /** List all resource templates registered on the server. */
  listResourceTemplates(
    timeout?: number,
  ): Promise<ListResourceTemplatesResult> {
    return this.client.listResourceTemplates(undefined, { timeout });
  }

  /** Read a resource by URI. */
  readResource(uri: string, timeout?: number): Promise<ReadResourceResult> {
    return this.client.readResource({ uri }, { timeout });
  }

  /** List all prompts registered on the server. */
  listPrompts(timeout?: number): Promise<ListPromptsResult> {
    return this.client.listPrompts(undefined, { timeout });
  }

  /** Get/render a prompt by name with optional arguments. */
  getPrompt(
    name: string,
    args: Record<string, string> = {},
    timeout?: number,
  ): Promise<GetPromptResult> {
    return this.client.getPrompt({ name, arguments: args }, { timeout });
  }

  /** Request autocompletion for a prompt/resource argument. */
  complete(
    params: Parameters<Client["complete"]>[0],
    timeout?: number,
  ): Promise<CompleteResult> {
    return this.client.complete(params, { timeout });
  }

  /** Whether the harness has been closed. */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Close the client and server connections and tear down the in-memory
   * transports. Safe to call multiple times.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    // Closing either side tears down the linked in-memory pair, so we close
    // both concurrently and tolerate errors from either side already closing.
    const results = await Promise.allSettled([
      this.client.close(),
      this.server.close ? this.server.close() : Promise.resolve(),
    ]);
    const errors = results
      .filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      )
      .map((r) => r.reason)
      // Ignore "connection already closed" noise from a linked peer close.
      .filter(
        (err) =>
          !(err instanceof Error && /connection closed/i.test(err.message)),
      );
    if (errors.length > 0) {
      throw new AggregateError(
        errors as Error[],
        "One or more errors occurred while closing the TestKit",
      );
    }
  }
}

/**
 * Create a connected {@link MCPTestKit} for the given server.
 *
 * The server is connected to a paired in-memory transport and a full MCP
 * initialize handshake is performed before the returned promise resolves.
 *
 * @param server - An `McpServer` or low-level `Server` instance.
 * @param options - Connection and client-capability options.
 *
 * @example
 * ```ts
 * import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
 * import { z } from "zod";
 * import { createTestKit } from "mcp-testkit";
 *
 * const server = new McpServer({ name: "calc", version: "1.0.0" });
 * server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
 *   content: [{ type: "text", text: String(a + b) }],
 * }));
 *
 * const kit = await createTestKit(server);
 * const result = await kit.callTool("add", { a: 2, b: 3 });
 * await kit.close();
 * ```
 */
export async function createTestKit(
  server: ConnectableServer,
  options?: TestKitOptions,
): Promise<MCPTestKit> {
  return MCPTestKit._connect(server, options);
}

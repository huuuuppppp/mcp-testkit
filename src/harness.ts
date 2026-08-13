import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CreateMessageRequestSchema,
  ElicitRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  CallToolResult,
  ClientCapabilities,
  CompleteResult,
  CreateMessageRequest,
  CreateMessageResult,
  ElicitRequest,
  ElicitResult,
  GetPromptResult,
  Implementation,
  JSONRPCMessage,
  ListPromptsResult,
  ListResourceTemplatesResult,
  ListResourcesResult,
  ListToolsResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { createExpectation, type Expectation } from "./assertions.js";
import {
  ElicitationMock,
  SamplingMock,
  type ElicitationResponder,
  type SamplingResponder,
} from "./mocks.js";
import {
  expectNotification,
  isNotificationMessage,
  type CapturedNotification,
  type NotificationExpectation,
} from "./notifications.js";

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

/**
 * Options controlling the mock client capabilities advertised to the server.
 *
 * Pass `false` to opt out of advertising a capability (useful for testing how
 * a server behaves with clients that do not support it). Pass an object to
 * pre-configure the responder.
 */
export interface MockFeatureOptions {
  sampling?: boolean | { respondWith?: SamplingResponder };
  elicitation?:
    | boolean
    | { respondWith?: ElicitationResponder };
}

export interface TestKitOptions {
  /**
   * Client implementation info advertised to the server during the
   * MCP initialize handshake.
   *
   * @default { name: "mcp-testkit", version: "0.2.0" }
   */
  clientInfo?: Implementation;
  /**
   * Extra client capabilities advertised during initialize. These are merged
   * on top of the capabilities implied by `mocks`.
   */
  clientCapabilities?: ClientCapabilities;
  /**
   * Configure mock server-facing client capabilities (sampling, elicitation).
   * Both are enabled by default with safe responders.
   *
   * @default { sampling: true, elicitation: true }
   */
  mocks?: MockFeatureOptions;
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

type NotificationListener = (notification: CapturedNotification) => void;

/**
 * A connected test harness for an MCP server.
 *
 * Obtain one with {@link createTestKit}. The harness wraps an in-memory
 * client/server pair so tests run in a single process with no subprocesses,
 * no stdio, and no network.
 */
export class MCPTestKit {
  readonly client: Client;
  /** Mock controller for `sampling/createMessage` requests. */
  readonly sampling: SamplingMock;
  /** Mock controller for `elicitation/create` requests. */
  readonly elicitation: ElicitationMock;

  private readonly server: ConnectableServer;
  private readonly clientTransport: Transport;
  private readonly serverTransport: Transport;
  private readonly capturedNotifications: CapturedNotification[] = [];
  private readonly notificationListeners = new Set<NotificationListener>();
  private closed = false;

  private constructor(
    client: Client,
    server: ConnectableServer,
    clientTransport: Transport,
    serverTransport: Transport,
    sampling: SamplingMock,
    elicitation: ElicitationMock,
  ) {
    this.client = client;
    this.server = server;
    this.clientTransport = clientTransport;
    this.serverTransport = serverTransport;
    this.sampling = sampling;
    this.elicitation = elicitation;
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

    const samplingMock = new SamplingMock();
    const elicitationMock = new ElicitationMock();

    const samplingEnabled = options.mocks?.sampling !== false;
    const elicitationEnabled = options.mocks?.elicitation !== false;

    if (samplingEnabled) {
      const cfg = options.mocks?.sampling;
      if (cfg && typeof cfg === "object" && cfg.respondWith) {
        samplingMock.setResponder(cfg.respondWith);
      }
    }
    if (elicitationEnabled) {
      const cfg = options.mocks?.elicitation;
      if (cfg && typeof cfg === "object" && cfg.respondWith) {
        elicitationMock.setResponder(cfg.respondWith);
      }
    }

    const capabilities: ClientCapabilities = {
      ...(options.clientCapabilities ?? {}),
    };
    if (samplingEnabled) {
      capabilities.sampling = {};
    }
    if (elicitationEnabled) {
      capabilities.elicitation = { form: {} };
    }

    const client = new Client(
      options.clientInfo ?? { name: "mcp-testkit", version: "0.2.0" },
      { capabilities },
    );

    if (samplingEnabled) {
      client.setRequestHandler(CreateMessageRequestSchema, async (request, extra) => {
        const { params } = request as CreateMessageRequest;
        return (await samplingMock._handle(
          params,
          extra,
        )) as CreateMessageResult;
      });
    }

    if (elicitationEnabled) {
      client.setRequestHandler(ElicitRequestSchema, async (request, extra) => {
        const { params } = request as ElicitRequest;
        return (await elicitationMock._handle(
          params,
          extra,
        )) as ElicitResult;
      });
    }

    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    const kit = new MCPTestKit(
      client,
      server,
      clientTransport,
      serverTransport,
      samplingMock,
      elicitationMock,
    );
    kit.installNotificationCapture();

    return kit;
  }

  /**
   * Wrap the client transport's inbound message handler so we can record
   * every server-to-client notification without interfering with delivery.
   */
  private installNotificationCapture(): void {
    const transport = this.clientTransport;
    const original = transport.onmessage?.bind(transport);
    transport.onmessage = (message: JSONRPCMessage) => {
      if (isNotificationMessage(message)) {
        const captured: CapturedNotification = {
          method: message.method,
          params: (message as { params?: unknown }).params,
          timestamp: Date.now(),
        };
        this.capturedNotifications.push(captured);
        for (const listener of this.notificationListeners) {
          try {
            listener(captured);
          } catch {
            // listener errors must not break message delivery
          }
        }
      }
      return original?.(message);
    };
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

  // ── Notifications ────────────────────────────────────────────────

  /**
   * A snapshot of all server-to-client notifications captured since the
   * harness was created (or since {@link clearNotifications} was called).
   */
  get notifications(): readonly CapturedNotification[] {
    return [...this.capturedNotifications];
  }

  /**
   * Register a listener invoked for every captured notification.
   *
   * @returns An unsubscribe function.
   */
  onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  /**
   * Wait for a notification with the given method to arrive.
   *
   * Resolves immediately if a matching notification was already captured.
   *
   * @param method - The notification method to wait for.
   * @param timeoutMs - Rejects if no matching notification arrives in time.
   *                    Pass 0 to wait indefinitely. @default 5000
   */
  waitForNotification(
    method: string,
    timeoutMs = 5000,
  ): Promise<CapturedNotification> {
    const existing = this.capturedNotifications.find(
      (n) => n.method === method,
    );
    if (existing) return Promise.resolve(existing);

    return new Promise<CapturedNotification>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const unsubscribe = this.onNotification((n) => {
        if (n.method === method) {
          if (timer) clearTimeout(timer);
          unsubscribe();
          resolve(n);
        }
      });
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          unsubscribe();
          reject(
            new Error(
              `Timed out after ${timeoutMs}ms waiting for notification "${method}"`,
            ),
          );
        }, timeoutMs);
      }
    });
  }

  /**
   * Start a framework-agnostic assertion chain for notifications with the
   * given method.
   */
  expectNotification(method: string): NotificationExpectation {
    return expectNotification(this.capturedNotifications, method);
  }

  /** Clear the captured notification history and pending listener state. */
  clearNotifications(): void {
    this.capturedNotifications.length = 0;
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
    this.notificationListeners.clear();
    const results = await Promise.allSettled([
      this.client.close(),
      this.server.close ? this.server.close() : Promise.resolve(),
    ]);
    const errors = results
      .filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      )
      .map((r) => r.reason)
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
 * By default the client advertises `sampling` and `elicitation` capabilities
 * with safe mock responders; access them via `kit.sampling` and
 * `kit.elicitation`. Notifications sent by the server are captured and
 * available via `kit.notifications`.
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

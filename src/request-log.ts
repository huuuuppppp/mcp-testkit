import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/** The outcome of a JSON-RPC request. */
export type RequestOutcome = "success" | "error";

/** Direction of a request relative to the client. */
export type RequestDirection = "client->server" | "server->client";

/** A single paired request/response entry in the log. */
export interface RequestLogEntry {
  /** The JSON-RPC request id, or `undefined` for notifications. */
  id?: string | number;
  /** The method name, e.g. `tools/call`. */
  method: string;
  /** Direction of the request relative to the client. */
  direction: RequestDirection;
  /** The request params, if any. */
  params?: unknown;
  /** The response result (for successful requests). */
  result?: unknown;
  /** The JSON-RPC error object (for failed requests). */
  error?: { code: number; message: string; data?: unknown };
  /** Whether the request succeeded. */
  outcome: RequestOutcome;
  /** Epoch milliseconds when the request was observed. */
  requestTimestamp: number;
  /** Epoch milliseconds when the response was received/sent. */
  responseTimestamp?: number;
  /** Round-trip duration in milliseconds. */
  durationMs?: number;
}

function hasId(message: JSONRPCMessage): message is JSONRPCMessage & {
  id: string | number;
} {
  return "id" in message && message.id !== undefined;
}

function isRequest(
  message: JSONRPCMessage,
): message is JSONRPCMessage & { method: string; id: string | number } {
  return "method" in message && hasId(message);
}

function isResponse(
  message: JSONRPCMessage,
): message is JSONRPCMessage & {
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
} {
  return hasId(message) && !("method" in message);
}

/**
 * Records paired JSON-RPC requests/responses observed on a client transport.
 *
 * It captures both directions: client-initiated requests (e.g. `tools/call`)
 * and server-initiated requests (e.g. `sampling/createMessage`,
 * `elicitation/create`, `roots/list`).
 */
export class RequestLog {
  private readonly entries: RequestLogEntry[] = [];
  private readonly pending = new Map<string | number, RequestLogEntry>();

  /** Record an outgoing message from the client. */
  recordOutgoing(message: JSONRPCMessage, timestamp = Date.now()): void {
    if (isRequest(message)) {
      const entry: RequestLogEntry = {
        id: message.id,
        method: message.method,
        direction: "client->server",
        params: (message as { params?: unknown }).params,
        outcome: "success",
        requestTimestamp: timestamp,
      };
      this.pending.set(message.id, entry);
      this.entries.push(entry);
    } else if (isResponse(message)) {
      this.pairResponse(message.id, message, timestamp);
    } else if ("method" in message) {
      // outbound notification
      this.entries.push({
        method: message.method,
        direction: "client->server",
        params: (message as { params?: unknown }).params,
        outcome: "success",
        requestTimestamp: timestamp,
      });
    }
  }

  /** Record an incoming message to the client. */
  recordIncoming(message: JSONRPCMessage, timestamp = Date.now()): void {
    if (isRequest(message)) {
      // A server-initiated request (sampling, elicitation, roots, ...).
      const entry: RequestLogEntry = {
        id: message.id,
        method: message.method,
        direction: "server->client",
        params: (message as { params?: unknown }).params,
        outcome: "success",
        requestTimestamp: timestamp,
      };
      this.pending.set(message.id, entry);
      this.entries.push(entry);
    } else if (isResponse(message)) {
      this.pairResponse(message.id, message, timestamp);
    }
  }

  private pairResponse(
    id: string | number,
    message: { result?: unknown; error?: { code: number; message: string; data?: unknown } },
    timestamp: number,
  ): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    entry.responseTimestamp = timestamp;
    entry.durationMs = timestamp - entry.requestTimestamp;
    if (message.error) {
      entry.outcome = "error";
      entry.error = message.error;
    } else {
      entry.result = message.result;
    }
    this.pending.delete(id);
  }

  /** A snapshot of all log entries in chronological order. */
  all(): readonly RequestLogEntry[] {
    return [...this.entries];
  }

  /** Return entries for a given method. */
  forMethod(method: string): readonly RequestLogEntry[] {
    return this.entries.filter((e) => e.method === method);
  }

  /** Return only request/response pairs (excludes notifications). */
  requests(): readonly RequestLogEntry[] {
    return this.entries.filter((e) => e.id !== undefined);
  }

  /** Return only failed requests. */
  errors(): readonly RequestLogEntry[] {
    return this.entries.filter((e) => e.outcome === "error");
  }

  /** Return server-initiated requests (e.g. sampling). */
  serverRequests(): readonly RequestLogEntry[] {
    return this.entries.filter((e) => e.direction === "server->client");
  }

  /** Clear the log. */
  clear(): void {
    this.entries.length = 0;
    this.pending.clear();
  }
}

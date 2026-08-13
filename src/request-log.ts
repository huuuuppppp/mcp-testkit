import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/** The outcome of a JSON-RPC request. */
export type RequestOutcome = "success" | "error";

/** A single paired request/response entry in the log. */
export interface RequestLogEntry {
  /** The JSON-RPC request id, or `undefined` for notifications. */
  id?: string | number;
  /** The method name, e.g. `tools/call`. */
  method: string;
  /** The request params, if any. */
  params?: unknown;
  /** The response result (for successful requests). */
  result?: unknown;
  /** The JSON-RPC error object (for failed requests). */
  error?: { code: number; message: string; data?: unknown };
  /** Whether the request succeeded. */
  outcome: RequestOutcome;
  /** Epoch milliseconds when the request was sent. */
  requestTimestamp: number;
  /** Epoch milliseconds when the response was received. */
  responseTimestamp?: number;
  /** Round-trip duration in milliseconds. */
  durationMs?: number;
}

/**
 * Records paired JSON-RPC requests/responses observed on a transport.
 *
 * The harness installs this by wrapping the client transport's `send` and
 * `onmessage`. It is intentionally independent of any test framework.
 */
export class RequestLog {
  private readonly entries: RequestLogEntry[] = [];
  private readonly pending = new Map<
    string | number,
    RequestLogEntry
  >();

  /** Record an outgoing message (request or notification). */
  recordOutgoing(message: JSONRPCMessage, timestamp = Date.now()): void {
    if (!("method" in message)) return;
    if (!("id" in message) || message.id === undefined) {
      // notification — record without pairing
      this.entries.push({
        method: message.method,
        params: (message as { params?: unknown }).params,
        outcome: "success",
        requestTimestamp: timestamp,
      });
      return;
    }
    const id = message.id as string | number;
    const entry: RequestLogEntry = {
      id,
      method: message.method,
      params: (message as { params?: unknown }).params,
      outcome: "success",
      requestTimestamp: timestamp,
    };
    this.pending.set(id, entry);
    this.entries.push(entry);
  }

  /** Record an incoming response message and pair it with its request. */
  recordIncoming(message: JSONRPCMessage, timestamp = Date.now()): void {
    if (!("id" in message) || message.id === undefined) return;
    const id = message.id as string | number;
    const entry = this.pending.get(id);
    if (!entry) return;

    entry.responseTimestamp = timestamp;
    entry.durationMs = timestamp - entry.requestTimestamp;
    const msg = message as {
      result?: unknown;
      error?: { code: number; message: string; data?: unknown };
    };
    if (msg.error) {
      entry.outcome = "error";
      entry.error = msg.error;
    } else {
      entry.result = msg.result;
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

  /** Clear the log. */
  clear(): void {
    this.entries.length = 0;
    this.pending.clear();
  }
}

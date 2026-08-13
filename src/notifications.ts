import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/** A server-to-client notification captured by the test harness. */
export interface CapturedNotification {
  /** The notification method, e.g. `notifications/tools/list_changed`. */
  method: string;
  /** The notification params, if any. */
  params?: unknown;
  /** Epoch milliseconds when the notification was received. */
  timestamp: number;
}

/**
 * Returns true if the given JSON-RPC message is a notification (has no `id`).
 */
export function isNotificationMessage(
  message: JSONRPCMessage,
): message is Extract<JSONRPCMessage, { method: string }> & { id?: undefined } {
  return (
    typeof message === "object" &&
    message !== null &&
    "method" in message &&
    !("id" in message)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function deepIncludes(actual: unknown, expected: unknown): boolean {
  if (expected === actual) return true;
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.every((v, i) => deepIncludes(actual[i], v))
    );
  }
  if (isPlainObject(expected) && isPlainObject(actual)) {
    return Object.entries(expected).every(([k, v]) =>
      deepIncludes(actual[k], v),
    );
  }
  return false;
}

function describe(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function fail(message: string): never {
  const g = globalThis as unknown as {
    AssertionError?: new (message: string) => Error;
  };
  const Err = g.AssertionError ?? Error;
  throw new Err(message);
}

export interface NotificationExpectation {
  /** Negates the next assertion. */
  readonly not: NotificationExpectation;
  /** Assert that at least one notification with this method was sent. */
  toBeSent(): void;
  /** Assert how many notifications with this method were sent. */
  toHaveCount(count: number): void;
  /**
   * Assert that at least one notification with this method was sent with
   * params containing the given partial object (deep, partial match).
   */
  toIncludeParams(partial: Record<string, unknown>): void;
}

class NotificationExpectationImpl implements NotificationExpectation {
  constructor(
    private readonly all: CapturedNotification[],
    private readonly method: string,
    private readonly negated = false,
  ) {}

  get not(): NotificationExpectation {
    return new NotificationExpectationImpl(this.all, this.method, !this.negated);
  }

  private matching(): CapturedNotification[] {
    return this.all.filter((n) => n.method === this.method);
  }

  private check(pass: boolean, message: string): void {
    const ok = this.negated ? !pass : pass;
    if (!ok) {
      fail(this.negated ? `Expected not: ${message}` : message);
    }
  }

  toBeSent(): void {
    this.check(
      this.matching().length > 0,
      `expected notification "${this.method}" to have been sent, but it was not. Sent: [${this.all.map((n) => n.method).join(", ")}]`,
    );
  }

  toHaveCount(count: number): void {
    const actual = this.matching().length;
    this.check(
      actual === count,
      `expected ${count} notification(s) of method "${this.method}", got ${actual}`,
    );
  }

  toIncludeParams(partial: Record<string, unknown>): void {
    const matches = this.matching().some((n) =>
      deepIncludes(n.params, partial),
    );
    this.check(
      matches,
      `expected a "${this.method}" notification whose params include ${describe(partial)}`,
    );
  }
}

/**
 * Start a framework-agnostic assertion chain against notifications with the
 * given method.
 */
export function expectNotification(
  all: CapturedNotification[],
  method: string,
): NotificationExpectation {
  return new NotificationExpectationImpl(all, method);
}

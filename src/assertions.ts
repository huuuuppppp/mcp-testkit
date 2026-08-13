import type { CallToolResult, ContentBlock, EmbeddedResource } from "@modelcontextprotocol/sdk/types.js";

/**
 * Error thrown when an `mcp-testkit` assertion fails.
 *
 * It extends the global `AssertionError` when available (so Node's
 * `node:test` reports it natively) and falls back to `Error` otherwise.
 * Vitest and Jest both treat any thrown error as a test failure.
 */
function createAssertionErrorClass(): new (message: string) => Error {
  const g = globalThis as unknown as {
    AssertionError?: new (message: string) => Error;
  };
  if (g.AssertionError) return g.AssertionError;
  return class MCPTestKitAssertionError extends Error {
    override name = "AssertionError";
    constructor(message: string) {
      super(message);
    }
  };
}

const AssertionErrorImpl = createAssertionErrorClass();

/** A typed content block that carries text. */
export interface TextContentLike {
  type: "text";
  text: string;
}

function isTextBlock(block: ContentBlock): block is TextContentLike {
  return block.type === "text";
}

function isEmbeddedResource(block: ContentBlock): block is EmbeddedResource {
  return block.type === "resource";
}

/** Return every text content block from a tool result. */
export function textBlocks(result: CallToolResult): string[] {
  const out: string[] = [];
  for (const block of result.content) {
    if (isTextBlock(block)) {
      out.push(block.text);
    } else if (isEmbeddedResource(block)) {
      const contents = block.resource as { text?: unknown };
      if (typeof contents.text === "string") {
        out.push(contents.text);
      }
    }
  }
  return out;
}

/**
 * Return all text produced by a tool result, concatenated with newlines.
 *
 * Text comes from `text` content blocks and from the `text` field of any
 * embedded text resource.
 */
export function text(result: CallToolResult): string {
  return textBlocks(result).join("\n");
}

/** Return the result's structured content, or `undefined` if absent. */
export function structured(
  result: CallToolResult,
): Record<string, unknown> | undefined {
  return result.structuredContent as Record<string, unknown> | undefined;
}

/** Whether the tool result is an error result (`isError === true`). */
export function isErrorResult(result: CallToolResult): boolean {
  return result.isError === true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function deepMatch(actual: unknown, expected: unknown): boolean {
  if (expected === actual) return true;
  if (typeof expected !== typeof actual) return false;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((v, i) => deepMatch(actual[i], v));
  }
  if (isPlainObject(expected) && isPlainObject(actual)) {
    return Object.entries(expected).every(([k, v]) =>
      deepMatch(actual[k], v),
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

export interface Expectation<T> {
  /** Negates the next assertion. */
  readonly not: Expectation<T>;
  /** Assert the result is a successful (non-error) tool result. */
  toBeSuccess(): this;
  /** Assert the result is an error result (`isError === true`). */
  toBeError(): this;
  /** Assert the concatenated text output equals `expected`. */
  toBeText(expected: string): this;
  /** Assert the concatenated text output contains `substring`. */
  toContainText(substring: string): this;
  /** Assert the concatenated text matches `regex`. */
  toMatchText(regex: RegExp): this;
  /** Assert the result has at least one content block of the given type. */
  toHaveContentBlock(type: ContentBlock["type"]): this;
  /** Assert the result has at least one `image` content block. */
  toHaveImage(): this;
  /** Assert the result carries an embedded resource. */
  toHaveResource(): this;
  /** Assert `structuredContent` partially matches `partial`. */
  toMatchObject(partial: Record<string, unknown>): this;
  /** Assert the result contains exactly `count` content blocks. */
  toHaveBlockCount(count: number): this;
}

class ExpectationImpl implements Expectation<CallToolResult> {
  constructor(
    private readonly result: CallToolResult,
    private readonly negated = false,
  ) {}

  get not(): Expectation<CallToolResult> {
    return new ExpectationImpl(this.result, !this.negated);
  }

  private fail(message: string): never {
    throw new AssertionErrorImpl(message);
  }

  private check(pass: boolean, message: string): this {
    const ok = this.negated ? !pass : pass;
    if (!ok) {
      this.fail(this.negated ? `Expected not: ${message}` : message);
    }
    return this;
  }

  toBeSuccess(): this {
    return this.check(
      !isErrorResult(this.result),
      `expected result to be a success, but it was an error: ${text(this.result) || "(no text)"}`,
    );
  }

  toBeError(): this {
    const actualText = text(this.result);
    return this.check(
      isErrorResult(this.result),
      `expected result to be an error, but it was a success${actualText ? `: ${actualText}` : ""}`,
    );
  }

  toBeText(expected: string): this {
    const actual = text(this.result);
    return this.check(
      actual === expected,
      `expected tool text to be ${describe(expected)} but got ${describe(actual)}`,
    );
  }

  toContainText(substring: string): this {
    const actual = text(this.result);
    return this.check(
      actual.includes(substring),
      `expected tool text to contain ${describe(substring)} but got ${describe(actual)}`,
    );
  }

  toMatchText(regex: RegExp): this {
    const actual = text(this.result);
    return this.check(
      regex.test(actual),
      `expected tool text to match ${regex} but got ${describe(actual)}`,
    );
  }

  toHaveContentBlock(type: ContentBlock["type"]): this {
    const has = this.result.content.some((b) => b.type === type);
    return this.check(
      has,
      `expected result to have a content block of type "${type}"`,
    );
  }

  toHaveImage(): this {
    const has = this.result.content.some(
      (b) => b.type === "image" || b.type === "audio",
    );
    return this.check(has, "expected result to contain binary content");
  }

  toHaveResource(): this {
    const has = this.result.content.some((b) => b.type === "resource");
    return this.check(
      has,
      "expected result to contain an embedded resource",
    );
  }

  toMatchObject(partial: Record<string, unknown>): this {
    const sc = structured(this.result) ?? {};
    return this.check(
      deepMatch(sc, partial),
      `expected structuredContent to match ${describe(partial)} but got ${describe(sc)}`,
    );
  }

  toHaveBlockCount(count: number): this {
    const actual = this.result.content.length;
    return this.check(
      actual === count,
      `expected ${count} content block(s) but got ${actual}`,
    );
  }
}

/**
 * Start a framework-agnostic assertion chain on a tool result.
 *
 * The returned matchers throw an `AssertionError` on failure, which every
 * test runner (vitest, Jest, Bun test, node:test) treats as a failure.
 */
export function createExpectation(
  result: CallToolResult,
): Expectation<CallToolResult> {
  return new ExpectationImpl(result);
}

/** @deprecated Use {@link createExpectation}. */
export const expectResult = createExpectation;

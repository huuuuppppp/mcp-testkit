import type {
  GetPromptResult,
  PromptMessage,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";

function fail(message: string): never {
  const g = globalThis as unknown as {
    AssertionError?: new (message: string) => Error;
  };
  const Err = g.AssertionError ?? Error;
  throw new Err(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export interface ResourceExpectation {
  readonly not: ResourceExpectation;
  /** Assert that at least one resource content item carries this text. */
  toContainText(text: string): this;
  /** Assert that the concatenated text equals the given string. */
  toHaveText(text: string): this;
  /** Assert the number of content items. */
  toHaveContentCount(count: number): this;
  /** Assert that a content item with the given URI exists. */
  toBeFromUri(uri: string): this;
  /** Assert at least one content item has this MIME type. */
  toHaveMimeType(mimeType: string): this;
  /** Assert at least one content item is a blob (binary). */
  toContainBlob(): this;
}

class ResourceExpectationImpl implements ResourceExpectation {
  constructor(
    private readonly result: ReadResourceResult,
    private readonly negated = false,
  ) {}

  get not(): ResourceExpectation {
    return new ResourceExpectationImpl(this.result, !this.negated);
  }

  private check(pass: boolean, message: string): this {
    if (this.negated ? pass : !pass) {
      fail(this.negated ? `Expected not: ${message}` : message);
    }
    return this;
  }

  private texts(): string[] {
    const out: string[] = [];
    for (const c of this.result.contents) {
      if ("text" in c && typeof c.text === "string") out.push(c.text);
    }
    return out;
  }

  toContainText(text: string): this {
    const all = this.texts().join("\n");
    return this.check(
      all.includes(text),
      `expected resource text to contain ${describe(text)} but got ${describe(all)}`,
    );
  }

  toHaveText(text: string): this {
    const all = this.texts().join("\n");
    return this.check(
      all === text,
      `expected resource text to be ${describe(text)} but got ${describe(all)}`,
    );
  }

  toHaveContentCount(count: number): this {
    return this.check(
      this.result.contents.length === count,
      `expected ${count} content item(s) but got ${this.result.contents.length}`,
    );
  }

  toBeFromUri(uri: string): this {
    const has = this.result.contents.some((c) => c.uri === uri);
    return this.check(
      has,
      `expected a resource content item from uri ${describe(uri)}`,
    );
  }

  toHaveMimeType(mimeType: string): this {
    const has = this.result.contents.some((c) => c.mimeType === mimeType);
    return this.check(
      has,
      `expected a resource content item with mimeType ${describe(mimeType)}`,
    );
  }

  toContainBlob(): this {
    const has = this.result.contents.some((c) => "blob" in c);
    return this.check(has, "expected the resource to contain a blob item");
  }
}

export interface PromptExpectation {
  readonly not: PromptExpectation;
  /** Assert the prompt description contains the given string. */
  toHaveDescriptionContaining(text: string): this;
  /** Assert the number of messages. */
  toHaveMessageCount(count: number): this;
  /** Assert a message with the given role exists. */
  toHaveRole(role: PromptMessage["role"]): this;
  /** Assert that some message text contains the given substring. */
  toContainText(text: string): this;
}

class PromptExpectationImpl implements PromptExpectation {
  constructor(
    private readonly result: GetPromptResult,
    private readonly negated = false,
  ) {}

  get not(): PromptExpectation {
    return new PromptExpectationImpl(this.result, !this.negated);
  }

  private check(pass: boolean, message: string): this {
    if (this.negated ? pass : !pass) {
      fail(this.negated ? `Expected not: ${message}` : message);
    }
    return this;
  }

  private messageTexts(): string[] {
    const out: string[] = [];
    for (const m of this.result.messages) {
      if (m.content.type === "text") out.push(m.content.text);
    }
    return out;
  }

  toHaveDescriptionContaining(text: string): this {
    const desc = this.result.description ?? "";
    return this.check(
      desc.includes(text),
      `expected prompt description to contain ${describe(text)} but got ${describe(desc)}`,
    );
  }

  toHaveMessageCount(count: number): this {
    return this.check(
      this.result.messages.length === count,
      `expected ${count} message(s) but got ${this.result.messages.length}`,
    );
  }

  toHaveRole(role: PromptMessage["role"]): this {
    const has = this.result.messages.some((m) => m.role === role);
    return this.check(has, `expected a message with role ${describe(role)}`);
  }

  toContainText(text: string): this {
    const all = this.messageTexts().join("\n");
    return this.check(
      all.includes(text),
      `expected prompt messages to contain ${describe(text)} but got ${describe(all)}`,
    );
  }
}

/** Start an assertion chain on a `readResource` result. */
export function expectResource(result: ReadResourceResult): ResourceExpectation {
  return new ResourceExpectationImpl(result);
}

/** Start an assertion chain on a `getPrompt` result. */
export function expectPrompt(result: GetPromptResult): PromptExpectation {
  return new PromptExpectationImpl(result);
}

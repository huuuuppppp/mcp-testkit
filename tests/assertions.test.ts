import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  createExpectation,
  text,
  textBlocks,
  structured,
  isErrorResult,
} from "../src/index.js";

function okResult(extra: Partial<CallToolResult> = {}): CallToolResult {
  return {
    content: [{ type: "text", text: "hello world" }],
    ...extra,
  };
}

describe("text extraction helpers", () => {
  it("extracts text from text blocks", () => {
    const result = okResult({
      content: [
        { type: "text", text: "foo" },
        { type: "text", text: "bar" },
      ],
    });
    expect(textBlocks(result)).toEqual(["foo", "bar"]);
    expect(text(result)).toBe("foo\nbar");
  });

  it("returns structured content", () => {
    const result = okResult({ structuredContent: { k: 1 } });
    expect(structured(result)).toEqual({ k: 1 });
  });

  it("detects error results", () => {
    expect(isErrorResult(okResult())).toBe(false);
    expect(isErrorResult(okResult({ isError: true }))).toBe(true);
  });
});

describe("expectation matchers", () => {
  it("toBeText passes on equal text", () => {
    expect(() => createExpectation(okResult()).toBeText("hello world")).not.toThrow();
  });

  it("toBeText throws on mismatch", () => {
    expect(() => createExpectation(okResult()).toBeText("nope")).toThrow();
  });

  it("toContainText matches a substring", () => {
    createExpectation(okResult()).toContainText("world");
    expect(() => createExpectation(okResult()).toContainText("zzz")).toThrow();
  });

  it("toMatchText matches a regex", () => {
    createExpectation(okResult()).toMatchText(/hello/);
    expect(() => createExpectation(okResult()).toMatchText(/^\d+$/)).toThrow();
  });

  it("toBeError / toBeSuccess respect isError", () => {
    createExpectation(okResult()).toBeSuccess();
    createExpectation(okResult({ isError: true })).toBeError();
    expect(() => createExpectation(okResult()).toBeError()).toThrow();
    expect(() =>
      createExpectation(okResult({ isError: true })).toBeSuccess(),
    ).toThrow();
  });

  it("negation inverts the assertion", () => {
    createExpectation(okResult()).not.toBeText("different");
    expect(() => createExpectation(okResult()).not.toBeText("hello world")).toThrow();
  });

  it("toMatchObject performs partial deep matching", () => {
    const result = okResult({
      structuredContent: { user: { name: "ada", id: 1 }, ok: true },
    });
    createExpectation(result).toMatchObject({ user: { name: "ada" } });
    expect(() =>
      createExpectation(result).toMatchObject({ user: { name: "bob" } }),
    ).toThrow();
  });

  it("toHaveContentBlock detects block types", () => {
    const result: CallToolResult = {
      content: [
        { type: "text", text: "x" },
        { type: "image", data: "AAA=", mimeType: "image/png" },
      ],
    };
    createExpectation(result).toHaveContentBlock("image");
    createExpectation(result).toHaveImage();
    expect(() => createExpectation(okResult()).toHaveImage()).toThrow();
  });

  it("toHaveBlockCount counts blocks", () => {
    createExpectation(okResult()).toHaveBlockCount(1);
    expect(() => createExpectation(okResult()).toHaveBlockCount(2)).toThrow();
  });
});

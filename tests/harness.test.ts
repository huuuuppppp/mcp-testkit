import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createTestKit, type MCPTestKit } from "../src/index.js";

function makeServer(): McpServer {
  const server = new McpServer(
    { name: "test-server", version: "2.0.0" },
    { instructions: "a server under test" },
  );

  server.tool(
    "add",
    "Add two numbers",
    { a: z.number(), b: z.number() },
    async ({ a, b }) => ({
      content: [{ type: "text", text: String(a + b) }],
      structuredContent: { sum: a + b },
    }),
  );

  server.tool(
    "fail",
    "Always errors",
    {},
    async () => ({
      isError: true,
      content: [{ type: "text", text: "nope" }],
    }),
  );

  server.resource("doc", "test://doc", async (uri) => ({
    contents: [{ uri: uri.href, text: "doc body" }],
  }));

  server.prompt(
    "greet",
    { name: z.string() },
    ({ name }) => ({
      messages: [
        { role: "user", content: { type: "text", text: `Hi ${name}` } },
      ],
    }),
  );

  return server;
}

describe("createTestKit", () => {
  let kit: MCPTestKit;

  beforeEach(async () => {
    kit = await createTestKit(makeServer());
  });

  afterEach(async () => {
    await kit.close();
  });

  it("performs the initialize handshake and exposes server info", () => {
    expect(kit.serverInfo).toMatchObject({
      name: "test-server",
      version: "2.0.0",
    });
    expect(kit.capabilities).toBeDefined();
  });

  it("responds to ping", async () => {
    const result = await kit.ping();
    expect(result).toBeDefined();
  });

  it("lists registered tools", async () => {
    const result = await kit.listTools();
    expect(result.tools.map((t) => t.name)).toEqual(["add", "fail"]);
    expect(result.tools[0]?.description).toBe("Add two numbers");
  });

  it("calls a tool and returns text + structured content", async () => {
    const result = await kit.callTool("add", { a: 2, b: 3 });
    expect(result.isError).not.toBe(true);
    await kit.expect(result).toBeText("5");
    await kit.expect(result).toMatchObject({ sum: 5 });
  });

  it("expectTool chains a call and an assertion", async () => {
    const expectation = await kit.expectTool("add", { a: 10, b: 20 });
    expectation.toBeText("30");
  });

  it("surfaces tool error results", async () => {
    const result = await kit.callTool("fail", {});
    expect(result.isError).toBe(true);
    kit.expect(result).toBeError();
    kit.expect(result).not.toBeSuccess();
  });

  it("lists and reads resources", async () => {
    const list = await kit.listResources();
    expect(list.resources.map((r) => r.name)).toContain("doc");

    const read = await kit.readResource("test://doc");
    const text = read.contents
      .map((c) => ("text" in c ? c.text : ""))
      .join("");
    expect(text).toBe("doc body");
  });

  it("lists and renders prompts", async () => {
    const list = await kit.listPrompts();
    expect(list.prompts.map((p) => p.name)).toContain("greet");

    const prompt = await kit.getPrompt("greet", { name: "world" });
    const first = prompt.messages[0];
    expect(first?.content.type).toBe("text");
    if (first?.content.type === "text") {
      expect(first.content.text).toBe("Hi world");
    }
  });

  it("returns an error result for invalid tool arguments", async () => {
    const result = await kit.callTool("add", { a: "not-a-number", b: 3 });
    expect(result.isError).toBe(true);
    kit.expect(result).toBeError();
  });

  it("is idempotent on close", async () => {
    await kit.close();
    await kit.close();
    expect(kit.isClosed).toBe(true);
  });
});

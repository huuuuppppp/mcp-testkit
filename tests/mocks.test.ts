import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CreateMessageResultSchema,
  ElicitResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createTestKit, type MCPTestKit } from "../src/index.js";

function buildServer() {
  const server = new McpServer(
    { name: "mock-server", version: "1.0.0" },
    { capabilities: { logging: {} } },
  );

  // Sends a logging notification, then returns text.
  server.tool(
    "log",
    { level: z.enum(["info", "error"]), message: z.string() },
    async ({ level, message }, extra) => {
      await extra.sendNotification({
        method: "notifications/message",
        params: { level, data: message, logger: "test" },
      });
      return { content: [{ type: "text", text: "logged" }] };
    },
  );

  // Asks the client to sample a model and returns the mocked response text.
  server.tool("ask", { prompt: z.string() }, async ({ prompt }, extra) => {
    const result = await extra.sendRequest(
      {
        method: "sampling/createMessage",
        params: {
          maxTokens: 100,
          messages: [{ role: "user", content: { type: "text", text: prompt } }],
        },
      },
      CreateMessageResultSchema,
    );
    const text =
      result.content.type === "text" ? result.content.text : "(non-text)";
    return { content: [{ type: "text", text }] };
  });

  // Asks the client to elicit input and returns the action and content.
  server.tool(
    "elicit",
    { question: z.string() },
    async ({ question }, extra) => {
      const result = await extra.sendRequest(
        {
          method: "elicitation/create",
          params: {
            message: question,
            requestedSchema: {
              type: "object",
              properties: { answer: { type: "string" } },
            },
          },
        },
        ElicitResultSchema,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              action: result.action,
              content: result.content ?? null,
            }),
          },
        ],
      };
    },
  );

  return server;
}

describe("notifications", () => {
  let kit: MCPTestKit;

  beforeEach(async () => {
    kit = await createTestKit(buildServer());
  });
  afterEach(async () => {
    await kit.close();
  });

  it("captures server-to-client notifications", async () => {
    await kit.callTool("log", { level: "info", message: "hello" });

    expect(kit.notifications).toHaveLength(1);
    const n = kit.notifications[0]!;
    expect(n.method).toBe("notifications/message");
    expect(n.params).toMatchObject({ level: "info", data: "hello" });
    expect(n.timestamp).toEqual(expect.any(Number));
  });

  it("supports framework-agnostic notification assertions", async () => {
    await kit.callTool("log", { level: "error", message: "boom" });

    kit.expectNotification("notifications/message").toBeSent();
    kit
      .expectNotification("notifications/message")
      .toIncludeParams({ level: "error" });
    kit.expectNotification("notifications/message").toHaveCount(1);
    kit.expectNotification("notifications/resources/updated").not.toBeSent();

    expect(() =>
      kit.expectNotification("notifications/message").toHaveCount(2),
    ).toThrow();
  });

  it("supports onNotification listeners and waitForNotification", async () => {
    const received: string[] = [];
    const off = kit.onNotification((n) => received.push(n.method));

    const waited = kit.waitForNotification("notifications/message", 1000);
    await kit.callTool("log", { level: "info", message: "async" });

    const n = await waited;
    expect(n.method).toBe("notifications/message");
    expect(received).toContain("notifications/message");
    off();
  });

  it("rejects waitForNotification on timeout", async () => {
    await expect(
      kit.waitForNotification("notifications/message", 50),
    ).rejects.toThrow(/timed out/i);
  });
});

describe("sampling mock", () => {
  let kit: MCPTestKit;

  beforeEach(async () => {
    kit = await createTestKit(buildServer());
  });
  afterEach(async () => {
    await kit.close();
  });

  it("uses the default empty assistant response", async () => {
    const result = await kit.callTool("ask", { prompt: "hi" });
    kit.expect(result).toBeText("");
    expect(kit.sampling.requests).toHaveLength(1);
    expect(kit.sampling.requests[0]?.messages[0]?.content).toMatchObject({
      type: "text",
      text: "hi",
    });
  });

  it("scripts a response with respondWith", async () => {
    kit.sampling.respondWith({
      role: "assistant",
      model: "test-model",
      content: { type: "text", text: "mocked answer" },
      stopReason: "endTurn",
    });

    const result = await kit.callTool("ask", { prompt: "why?" });
    kit.expect(result).toBeText("mocked answer");
    expect(kit.requestsFor("sampling/createMessage")).toHaveLength(1);
  });

  it("scripts a response with a dynamic responder", async () => {
    kit.sampling.setResponder((params) => ({
      role: "assistant",
      model: "dyno",
      content: {
        type: "text",
        text: `echo:${params.messages[0]?.content.type === "text" ? params.messages[0].content.text : ""}`,
      },
    }));

    const result = await kit.callTool("ask", { prompt: "ping" });
    kit.expect(result).toBeText("echo:ping");
    expect(kit.sampling.requests).toHaveLength(1);
  });
});

describe("elicitation mock", () => {
  let kit: MCPTestKit;

  beforeEach(async () => {
    kit = await createTestKit(buildServer());
  });
  afterEach(async () => {
    await kit.close();
  });

  it("declines by default", async () => {
    const result = await kit.callTool("elicit", { question: "name?" });
    kit.expect(result).toContainText('"action":"decline"');
    expect(kit.elicitation.requests).toHaveLength(1);
    expect(kit.elicitation.requests[0]?.message).toBe("name?");
  });

  it("accepts with provided content", async () => {
    kit.elicitation.acceptWith({ answer: "Ada" });

    const result = await kit.callTool("elicit", { question: "name?" });
    kit.expect(result).toContainText('"action":"accept"');
    kit.expect(result).toContainText('"answer":"Ada"');
  });

  it("supports cancel and a custom responder", async () => {
    kit.elicitation.cancel();
    const r1 = await kit.callTool("elicit", { question: "q" });
    kit.expect(r1).toContainText('"action":"cancel"');

    kit.elicitation.setResponder((params) => ({
      action: "accept",
      content: { echoed: params.message },
    }));
    const r2 = await kit.callTool("elicit", { question: "again" });
    kit.expect(r2).toContainText('"echoed":"again"');
  });
});

describe("mocks opt-out", () => {
  it("does not advertise sampling when disabled", async () => {
    const kit = await createTestKit(buildServer(), {
      mocks: { sampling: false },
    });
    expect(kit.capabilities?.sampling).toBeUndefined();
    await kit.close();
  });
});

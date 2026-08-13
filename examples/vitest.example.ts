import { describe, it, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createTestKit, type MCPTestKit } from "mcp-testkit";

function buildCalculator() {
  const server = new McpServer({ name: "calculator", version: "1.0.0" });

  server.tool(
    "divide",
    "Divide two numbers",
    { dividend: z.number(), divisor: z.number().positive() },
    async ({ dividend, divisor }) => ({
      content: [{ type: "text", text: String(dividend / divisor) }],
      structuredContent: { quotient: dividend / divisor },
    }),
  );

  return server;
}

describe("calculator", () => {
  let kit: MCPTestKit;

  afterEach(async () => {
    await kit?.close();
  });

  it("divides two positive numbers", async () => {
    kit = await createTestKit(buildCalculator());
    (await kit.expectTool("divide", { dividend: 10, divisor: 4 }))
      .toBeSuccess()
      .toBeText("2.5")
      .toMatchObject({ quotient: 2.5 });
  });

  it("rejects a zero divisor through schema validation", async () => {
    kit = await createTestKit(buildCalculator());
    const result = await kit.callTool("divide", { dividend: 1, divisor: 0 });
    kit.expect(result).toBeError();
  });
});

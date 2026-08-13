// Minimal stdio MCP server used by the contract test suite.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer(
  { name: "echo-fixture", version: "1.2.3" },
  { instructions: "A tiny fixture server for mcp-testkit contract tests." },
);

server.tool(
  "echo",
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: "text", text: message }],
  }),
);

server.tool(
  "boom",
  {},
  async () => ({
    isError: true,
    content: [{ type: "text", text: "something went wrong" }],
  }),
);

server.resource(
  "greeting",
  "test://greeting",
  async (uri) => ({
    contents: [{ uri: uri.href, text: "hello from resource" }],
  }),
);

server.prompt(
  "greet",
  { name: z.string() },
  ({ name }) => ({
    messages: [
      {
        role: "user",
        content: { type: "text", text: `Hello, ${name}!` },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);

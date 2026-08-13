// @ts-check
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * A small "task manager" MCP server used to demonstrate mcp-testkit.
 *
 * Tools:
 *   - add_task(title, priority?)
 *   - list_tasks(status?)
 *   - complete_task(id)
 *   - summarize_tasks()  -> asks the connected LLM (via sampling) to summarize
 *
 * Resources:
 *   - tasks://all
 *   - tasks://{id}
 *
 * Prompts:
 *   - daily_standup
 */
export function createTaskServer() {
  const server = new McpServer(
    { name: "task-server", version: "1.0.0" },
    { capabilities: { logging: {} } },
  );

  /** @type {{ id: number; title: string; priority: "low"|"normal"|"high"; done: boolean }[]} */
  const tasks = [];
  let nextId = 1;

  server.tool(
    "add_task",
    "Create a new task",
    {
      title: z.string().min(1),
      priority: z.enum(["low", "normal", "high"]).default("normal"),
    },
    async ({ title, priority }, extra) => {
      const task = { id: nextId++, title, priority, done: false };
      tasks.push(task);
      await extra.sendNotification({
        method: "notifications/message",
        params: { level: "info", data: `task ${task.id} created` },
      });
      return {
        content: [{ type: "text", text: `Created task #${task.id}: ${title}` }],
        structuredContent: { id: task.id },
      };
    },
  );

  server.tool(
    "list_tasks",
    "List tasks, optionally filtered by status",
    {
      status: z.enum(["open", "done"]).optional(),
    },
    async ({ status }) => {
      const filtered = tasks.filter((t) =>
        status === "done" ? t.done : status === "open" ? !t.done : true,
      );
      return {
        content: [
          {
            type: "text",
            text: filtered.length
              ? filtered.map((t) => `${t.done ? "[x]" : "[ ]"} #${t.id} (${t.priority}) ${t.title}`).join("\n")
              : "No tasks",
          },
        ],
        structuredContent: { count: filtered.length, tasks: filtered },
      };
    },
  );

  server.tool(
    "complete_task",
    "Mark a task as done",
    { id: z.number().int().positive() },
    async ({ id }) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) {
        return {
          isError: true,
          content: [{ type: "text", text: `Task #${id} not found` }],
        };
      }
      task.done = true;
      return { content: [{ type: "text", text: `Completed task #${id}` }] };
    },
  );

  // This tool asks the *client* to sample an LLM — perfect place to use the
  // sampling mock in tests.
  server.tool(
    "summarize_tasks",
    "Ask the LLM to summarize open tasks",
    {},
    async (_args, extra) => {
      const open = tasks.filter((t) => !t.done);
      const result = await extra.sendRequest(
        {
          method: "sampling/createMessage",
          params: {
            maxTokens: 200,
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Summarize these tasks in one sentence: ${JSON.stringify(open)}`,
                },
              },
            ],
          },
        },
        // result schema validated by SDK; we keep it loose for the demo
        /** @type {any} */ (z.object({
          role: z.literal("assistant"),
          content: z.object({ type: z.literal("text"), text: z.string() }),
          model: z.string(),
        })),
      );
      return {
        content: [{ type: "text", text: result.content.text }],
      };
    },
  );

  server.resource("all-tasks", "tasks://all", async () => ({
    contents: [
      {
        uri: "tasks://all",
        mimeType: "application/json",
        text: JSON.stringify(tasks, null, 2),
      },
    ],
  }));

  server.resource(
    "one-task",
    new ResourceTemplate("tasks://{id}", { list: undefined }),
    { mimeType: "application/json" },
    async (uri) => {
      const id = Number(uri.hostname || uri.pathname.replace(/^\//, ""));
      const task = tasks.find((t) => t.id === id);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(task ?? null),
          },
        ],
      };
    },
  );

  server.prompt(
    "daily_standup",
    "Generate a standup update from your tasks",
    { name: z.string().default("teammate") },
    ({ name }) => ({
      description: `Standup summary for ${name}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Hi ${name}, here are your open tasks for standup.`,
          },
        },
      ],
    }),
  );

  return server;
}

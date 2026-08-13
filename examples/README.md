# Examples

## `task-server.mjs` + `demo.mjs`

A small **task manager** MCP server and a runnable script that tests it with
`mcp-testkit`. The server has tools (`add_task`, `list_tasks`, `complete_task`,
`summarize_tasks`), resources (`tasks://all`, `tasks://{id}`), and a prompt
(`daily_standup`).

Notably, `summarize_tasks` asks the **client** to sample an LLM via
`sampling/createMessage`, which the demo mocks deterministically.

### Run

```bash
npm install
npm run build
node examples/demo.mjs
```

The demo exercises:

- tool calls with text and `structuredContent` assertions
- error results (`complete_task` on a missing id)
- the **sampling mock** (scripting the LLM response)
- resource and prompt assertion chains
- captured **notifications** (`add_task` emits a logging notification)
- the **request/response log**, including the server-initiated sampling request

## `vitest.example.ts`

A minimal unit test using `createTestKit` with Vitest.

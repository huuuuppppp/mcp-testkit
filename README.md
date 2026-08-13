# mcp-testkit

> Type-safe, in-process testing toolkit for [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers.

[![CI](https://github.com/huuuuppppp/mcp-testkit/actions/workflows/ci.yml/badge.svg)](https://github.com/huuuuppppp/mcp-testkit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@qi_c/mcp-testkit?logo=npm&color=cb3837)](https://www.npmjs.com/package/@qi_c/mcp-testkit)
[![npm downloads](https://img.shields.io/npm/dm/@qi_c/mcp-testkit?color=cb3837)](https://www.npmjs.com/package/@qi_c/mcp-testkit)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-%5E1.0-7c3aed)](https://github.com/modelcontextprotocol/typescript-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

`mcp-testkit` lets MCP server authors write fast, deterministic unit tests
**without subprocesses, stdio, or network sockets**. It wires an in-memory
client to your server using the official SDK's linked transport, performs a
real MCP `initialize` handshake, and gives you a clean, type-aware API to call
tools, read resources, render prompts, and assert on results.

For CI it also ships a **contract CLI** that spawns your real server over
stdio and verifies it initializes, responds to ping, lists its surface area,
and handles sample calls.

---

## Why

The MCP TypeScript SDK provides servers, clients, and transports — but **no
first-class testing story**. Existing approaches force you to either:

- spawn your server as a subprocess and talk over stdio (slow, flaky, hard to
  assert against), or
- poke at internal handler functions (bypasses schema validation and the MCP
  protocol layer entirely).

`mcp-testkit` fills that gap:

- **Real protocol path** — requests go through serialization, schema
  validation, and the full MCP handshake, just like production.
- **In-process speed** — a linked `InMemoryTransport` means tests run in
  milliseconds with no processes to manage.
- **Framework agnostic** — assertions throw plain `AssertionError`s, so they
  work with **Vitest, Jest, Bun test, and `node:test`**.
- **Zero lock-in** — the underlying `Client` is always accessible for advanced
  assertions.

---## Installation

```bash
npm install --save-dev @qi_c/mcp-testkit
```

`mcp-testkit` has peer dependencies on `@modelcontextprotocol/sdk` (`^1.0`)
and `zod` (`^3.23`), which you almost already have if you're building an MCP
server.

Requires **Node.js 18 or newer**.

---

## Quick start

```ts
import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createTestKit } from "@qi_c/mcp-testkit";

function buildServer() {
  const server = new McpServer({ name: "calculator", version: "1.0.0" });

  server.tool(
    "add",
    "Add two numbers",
    { a: z.number(), b: z.number() },
    async ({ a, b }) => ({
      content: [{ type: "text", text: String(a + b) }],
      structuredContent: { sum: a + b },
    }),
  );

  return server;
}

describe("calculator", () => {
  it("adds two numbers", async () => {
    const kit = await createTestKit(buildServer());

    const result = await kit.callTool("add", { a: 2, b: 3 });

    // framework-agnostic assertions
    kit.expect(result).toBeSuccess();
    kit.expect(result).toBeText("5");
    kit.expect(result).toMatchObject({ sum: 5 });

    // or assert with your own runner
    expect(result.isError).not.toBe(true);

    await kit.close();
  });
});
```

---

## Guide

### Creating a test kit

`createTestKit` accepts both the high-level `McpServer` and the low-level
`Server` from the SDK. It returns a connected `MCPTestKit` after the
initialize handshake completes.

```ts
const kit = await createTestKit(server, {
  clientInfo: { name: "my-tests", version: "1.0.0" },
  clientCapabilities: { sampling: {} },
  timeoutMs: 10_000,
});
```

Always call `await kit.close()` in an `afterEach`/teardown hook.

### Tools

```ts
const tools = await kit.listTools();           // -> { tools: Tool[] }
const result = await kit.callTool("add", { a: 1, b: 2 });

// One-shot expectation:
(await kit.expectTool("add", { a: 1, b: 2 })).toBeText("3");
```

Invalid arguments are rejected by the SDK's schema validation and surface as
an error result.

### Resources

```ts
const resources = await kit.listResources();
const templates = await kit.listResourceTemplates();
const doc = await kit.readResource("file:///README.md");
```

### Prompts

```ts
const prompts = await kit.listPrompts();
const rendered = await kit.getPrompt("greet", { name: "Ada" });
```

### Assertions

Assertions are framework-agnostic and throw an `AssertionError` on failure,
which every test runner treats as a failed test. Negate any assertion with
`.not`:

```ts
kit.expect(result).toBeText("hello");
kit.expect(result).toContainText("ell");
kit.expect(result).toMatchText(/^h/);
kit.expect(result).not.toBeError();

kit.expect(result).toHaveContentBlock("image");
kit.expect(result).toHaveBlockCount(1);
kit.expect(result).toMatchObject({ user: { id: 1 } }); // partial deep match
```

Helper functions are also available for custom assertions:

```ts
import { text, textBlocks, structured, isErrorResult } from "@qi_c/mcp-testkit";

text(result);            // concatenated text content
textBlocks(result);      // string[]
structured(result);      // structuredContent or undefined
isErrorResult(result);   // boolean
```

### Request/response log

Every JSON-RPC request/response on the client transport is paired and logged,
which is useful for asserting that a tool triggered a downstream request (for
example, sampling) or for debugging protocol interactions:

```ts
await kit.callTool("ask", { prompt: "hi" });

kit.requests; // [{ id, method, params, result, outcome, durationMs, ... }]
kit.requestsFor("sampling/createMessage"); // just sampling requests
kit.requests.filter((r) => r.outcome === "error"); // failed requests
```

### Resource and prompt assertions

Chain assertions directly onto reads and prompts:

```ts
(await kit.expectResource("doc://readme"))
  .toContainText("Body")
  .toHaveMimeType("text/markdown")
  .not.toContainBlob();

(await kit.expectPrompt("summarize", { text: "long text..." }))
  .toHaveMessageCount(2)
  .toHaveRole("assistant")
  .toContainText("summarize");
```

Resource matchers: `toContainText`, `toHaveText`, `toHaveContentCount`,
`toBeFromUri`, `toHaveMimeType`, `toContainBlob`. Prompt matchers:
`toHaveDescriptionContaining`, `toHaveMessageCount`, `toHaveRole`,
`toContainText`. All support `.not`.

### Snapshots

Framework-agnostic snapshots are written to `__snapshots__/` as JSON. Set
`UPDATE_SNAPSHOTS=1` to update them (the same convention as Vitest/Jest):

```ts
const snap = kit.snapshot({ file: "server.snap.json" });
const { tools } = await kit.listTools();
snap.expect("tools", tools.map((t) => t.name));
// call snap.save() in an afterEach/afterAll hook (the node:test bridge does this)
```

### Using with Node's built-in test runner

The `@qi_c/mcp-testkit/node-test` subpath provides a bridge that auto-closes the kit
and saves snapshots when using `node --test`:

```ts
import test from "node:test";
import { withNodeTest } from "@qi_c/mcp-testkit/node-test";

test("adds numbers", async (t) => {
  const { kit } = await withNodeTest(t, buildServer());
  (await kit.expectTool("add", { a: 1, b: 2 })).toBeText("3");
});
```

Vitest, Jest, and Bun test work without any bridge — just use `createTestKit`
and close the kit in an `afterEach`.

### Accessing the raw client

For anything the harness doesn't wrap, the official SDK `Client` is exposed:

```ts
kit.client.setRequestHandler(/* ... */);
```

### Notifications

Every server-to-client notification is captured by the harness. The client
transport's inbound message handler is wrapped, so capture is transparent and
does not interfere with the SDK's own notification handling.

```ts
await kit.callTool("log", { level: "info", message: "started" });

// inspect the full history
kit.notifications; // [{ method, params, timestamp }, ...]

// framework-agnostic assertions
kit.expectNotification("notifications/message").toBeSent();
kit.expectNotification("notifications/message").toIncludeParams({ level: "info" });
kit.expectNotification("notifications/message").toHaveCount(1);
kit.expectNotification("notifications/resources/updated").not.toBeSent();

// wait for an async notification
const n = await kit.waitForNotification("notifications/message", 2000);

// subscribe to live notifications
const off = kit.onNotification((n) => console.log(n.method));
off();
```

### Sampling (LLM requests from server to client)

When a server calls `sampling/createMessage` to ask the client to sample an
LLM, you typically want a deterministic fake. The harness advertises the
`sampling` capability by default and exposes a mock responder:

```ts
// fixed response for every sampling request
kit.sampling.respondWith({
  role: "assistant",
  model: "test-model",
  content: { type: "text", text: "mocked completion" },
  stopReason: "endTurn",
});

// ...or compute one dynamically
kit.sampling.setResponder((params) => ({
  role: "assistant",
  model: "dyno",
  content: { type: "text", text: "echo" },
}));

// assert the server asked for sampling
expect(kit.sampling.requests).toHaveLength(1);
```

### Elicitation (server asks the client for user input)

Similarly, the harness advertises `elicitation` by default and lets you script
the user's response:

```ts
kit.elicitation.acceptWith({ answer: "Ada" });  // action: "accept"
kit.elicitation.decline();                      // action: "decline" (default)
kit.elicitation.cancel();                       // action: "cancel"

// full control
kit.elicitation.setResponder((params) => ({
  action: "accept",
  content: { echoed: params.message },
}));

expect(kit.elicitation.requests[0]?.message).toBe("What is your name?");
```

To test how your server behaves with a client that does **not** support one of
these capabilities, disable it:

```ts
const kit = await createTestKit(server, {
  mocks: { sampling: false, elicitation: false },
});
```

---

## Contract testing in CI

Unit tests cover your handlers; the **contract CLI** covers your packaged
server as a black box. It spawns your server over stdio, initializes it, pings
it, lists tools/resources/prompts, and optionally calls named tools with JSON
arguments.

```bash
# Basic smoke test
npx @qi_c/mcp-testkit contract node ./dist/server.js

# With sample tool calls
npx @qi_c/mcp-testkit contract node ./dist/server.js \
  --call ping='{}' \
  --call add='{"a":1,"b":2}'
```

Example output:

```
MCP TestKit — contract test
────────────────────────────────────────
Server: my-server@1.0.0
Tools: 4   Resources: 2   Prompts: 1

  ✓ initialize       12ms
  ✓ ping             1ms
  ✓ listTools        2ms
  ✓ listResources    1ms
  ✓ listPrompts      1ms
  ✓ call:ping        3ms

PASS
```

Exit code is `0` when every check passes, `1` otherwise — drop it straight
into a CI step.

You can also use the programmatic API:

```ts
import { runContract } from "@qi_c/mcp-testkit";

const result = await runContract({
  command: "node",
  args: ["./dist/server.js"],
  calls: { ping: {} },
});

if (!result.ok) process.exit(1);
```

---

## API reference

### `createTestKit(server, options?): Promise<MCPTestKit>`

| Option | Type | Description |
| --- | --- | --- |
| `clientInfo` | `Implementation` | Client identity sent during initialize. |
| `clientCapabilities` | `ClientCapabilities` | Capabilities to advertise. |
| `setupTransports` | `(t) => void \| Promise<void>` | Hook to customize the linked transports. |
| `mocks` | `{ sampling?, elicitation? }` | Configure mock client capabilities (both enabled by default). |
| `timeoutMs` | `number` | Default request timeout. |

### `MCPTestKit`

| Member | Description |
| --- | --- |
| `listTools(timeout?)` | List registered tools. |
| `callTool(name, args?, options?)` | Call a tool. |
| `listResources(timeout?)` | List resources. |
| `readResource(uri, timeout?)` | Read a resource by URI. |
| `listResourceTemplates(timeout?)` | List resource templates. |
| `listPrompts(timeout?)` | List prompts. |
| `getPrompt(name, args?, timeout?)` | Render a prompt. |
| `complete(params, timeout?)` | Request argument completion. |
| `ping(timeout?)` | Send a ping. |
| `expect(result)` | Start an assertion chain. |
| `expectTool(name, args?)` | Call a tool and start an assertion chain. |
| `notifications` | Snapshot of captured server-to-client notifications. |
| `onNotification(fn)` | Subscribe to notifications; returns unsubscribe. |
| `waitForNotification(method, ms?)` | Resolve when a matching notification arrives. |
| `expectNotification(method)` | Assert on notifications (`toBeSent`, `toHaveCount`, `toIncludeParams`). |
| `clearNotifications()` | Clear captured notification history. |
| `sampling` | Mock for `sampling/createMessage` requests. |
| `elicitation` | Mock for `elicitation/create` requests. |
| `requests` / `requestsFor(method)` | Paired JSON-RPC request/response log. |
| `expectResource(uri)` | Read a resource and start an assertion chain. |
| `expectPrompt(name, args?)` | Render a prompt and start an assertion chain. |
| `snapshot(options?)` | Lazily create a `SnapshotStore` for the kit. |
| `capabilities` / `serverInfo` | Values reported during initialize. |
| `close()` | Tear down the connection. |

### Assertions

`toBeSuccess()`, `toBeError()`, `toBeText(expected)`,
`toContainText(substring)`, `toMatchText(regex)`,
`toHaveContentBlock(type)`, `toHaveImage()`, `toHaveResource()`,
`toMatchObject(partial)`, `toHaveBlockCount(count)`. Prefix with `.not` to
negate.

---

## Examples

See the [tests](./tests) for complete, runnable examples covering
tools, resources, prompts, error results, and the contract CLI.

---

## Contributing

Contributions are welcome! Please read
[CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, coding standards,
and the pull request process.

All participants are expected to uphold the
[Code of Conduct](./CODE_OF_CONDUCT.md).

Please report security issues privately — see [SECURITY.md](./SECURITY.md).

---

## License

MIT © [huuuuppppp](https://github.com/huuuuppppp). See [LICENSE](./LICENSE).

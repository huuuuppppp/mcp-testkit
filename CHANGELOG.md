# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-08-13

### Fixed
- Request log now captures **server-initiated requests** (e.g.
  `sampling/createMessage`, `elicitation/create`) in addition to
  client-initiated ones, so `kit.requestsFor("sampling/createMessage")` works as
  expected. Each entry includes a `direction` field (`client->server` or
  `server->client`).

### Added
- Runnable `examples/task-server.mjs` + `examples/demo.mjs`: a task-manager MCP
  server exercised end-to-end with `mcp-testkit` (tools, resources, prompts,
  sampling mock, notifications, request log).
- `RequestLog.serverRequests()` accessor.

[0.3.1]: https://github.com/huuuuppppp/mcp-testkit/compare/v0.3.0...v0.3.1

## [0.3.1] - 2026-08-13

### Note
- Published to npm under the scoped name `@qi_c/mcp-testkit` (the unscoped
  `mcp-testkit` was blocked by npm as too similar to an existing package).

## [0.3.0] - 2026-08-13

### Added
- **Request/response log**: the harness records paired JSON-RPC requests and
  responses by wrapping the client transport, exposing method, params, result
  or error, outcome, and round-trip duration via `kit.requests`,
  `kit.requestsFor(method)`, and `kit.requests.filter(r => r.outcome === "error")`.
- **Resource assertions**: `expectResource(result)` / `kit.expectResource(uri)`
  with `toContainText`, `toHaveText`, `toHaveContentCount`, `toBeFromUri`,
  `toHaveMimeType`, `toContainBlob`, and `.not` negation.
- **Prompt assertions**: `expectPrompt(result)` / `kit.expectPrompt(name, args)`
  with `toHaveDescriptionContaining`, `toHaveMessageCount`, `toHaveRole`,
  `toContainText`, and `.not` negation.
- **Framework-agnostic snapshots**: `createSnapshotStore()` / `kit.snapshot()`
  writes JSON snapshots under `__snapshots__/`, supports
  `UPDATE_SNAPSHOTS=1` to update, and prunes dead keys.
- **`node:test` bridge**: `withNodeTest(t, server)` (from the
  `mcp-testkit/node-test` subpath) auto-closes the kit and saves snapshots via
  the test context's `after` hook; verified against the real `node --test` runner.

[0.3.0]: https://github.com/huuuuppppp/mcp-testkit/compare/v0.2.0...v0.3.0
## [0.2.0] - 2026-08-13

### Added
- **Notification capture**: the harness now records every server-to-client
  notification by transparently wrapping the client transport. Exposed via
  `kit.notifications`, `kit.onNotification(fn)`, `kit.waitForNotification(method, ms?)`,
  and `kit.clearNotifications()`.
- **Notification assertions**: `kit.expectNotification(method)` with
  `toBeSent()`, `toHaveCount(n)`, `toIncludeParams(partial)`, and `.not` negation.
- **Sampling mock**: the client advertises the `sampling` capability by
  default; `kit.sampling.respondWith(result)` and `kit.sampling.setResponder(fn)`
  script responses to `sampling/createMessage`, with all requests recorded on
  `kit.sampling.requests`.
- **Elicitation mock**: the client advertises the `elicitation` capability by
  default; `kit.elicitation.acceptWith(content)`, `.decline()`, `.cancel()`, and
  `.setResponder(fn)` script responses, with requests on
  `kit.elicitation.requests`.
- **`mocks` option** for `createTestKit` to opt out of (`sampling: false`,
  `elicitation: false`) or pre-configure either mock.
- New `examples/` directory with a runnable Vitest sample.
- Added `ROADMAP.md`.

### Changed
- The CLI now reads its version from `package.json` instead of a hardcoded value.

[0.2.0]: https://github.com/huuuuppppp/mcp-testkit/compare/v0.1.0...v0.2.0
## [0.1.0] - 2026-08-13

### Added
- `createTestKit(server)` — in-process test harness wired through the SDK's
  linked `InMemoryTransport`, with a full initialize handshake.
- `MCPTestKit` with `listTools`, `callTool`, `listResources`, `readResource`,
  `listResourceTemplates`, `listPrompts`, `getPrompt`, `complete`, and `ping`.
- Framework-agnostic assertion chain (`expect` / `createExpectation`) with
  `toBeSuccess`, `toBeError`, `toBeText`, `toContainText`, `toMatchText`,
  `toHaveContentBlock`, `toHaveImage`, `toHaveResource`, `toMatchObject`,
  `toHaveBlockCount`, and `.not` negation.
- Text extraction helpers: `text`, `textBlocks`, `structured`, `isErrorResult`.
- `runContract` — stdio contract/smoke tester for spawned MCP servers.
- `mcp-testkit contract` CLI for CI smoke tests.
- First-class TypeScript types and dual ESM/CJS builds.

[0.1.0]: https://github.com/huuuuppppp/mcp-testkit/releases/tag/v0.1.0

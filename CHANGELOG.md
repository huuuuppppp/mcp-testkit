# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

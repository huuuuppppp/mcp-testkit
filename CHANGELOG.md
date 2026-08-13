# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

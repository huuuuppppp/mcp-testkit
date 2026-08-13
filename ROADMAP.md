# Roadmap

This is a living plan, not a promise. Priorities may shift based on community
feedback. Shipped versions are recorded in [CHANGELOG.md](./CHANGELOG.md).

## Shipped

- **0.3.0**: request/response log, `expectResource`/`expectPrompt` chains,
  framework-agnostic snapshots, and a `node:test` bridge.
- **0.2.0**: notification capture and assertions, sampling and elicitation mocks.
- **0.1.0**: in-process harness, tool/resource/prompt wrappers, contract CLI.

## 0.4

- [ ] Snapshot testing integration for `listTools`/`listPrompts` via matchers
- [ ] Progress notification assertions (`onProgress` for a specific request)
- [ ] Optional streaming/SSE transport support in the contract CLI
- [ ] Coverage-style report of which tools/resources/prompts were exercised

## 1.0

- [ ] Stable public API with semantic-versioning guarantees
- [ ] Adapter recipes for Vitest, Jest, Bun test, and `node:test`
- [ ] Performance and concurrency hardening
- [ ] Guides for testing auth-elicitation and progressive-capability flows

## Beyond

- [ ] Transport-level fault injection (drops, timeouts, malformed frames)
- [ ] A hosted "MCP server health badge" powered by the contract tester

Feedback and contributions are welcome — open an issue to propose items.

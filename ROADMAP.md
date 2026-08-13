# Roadmap

This is a living plan, not a promise. Priorities may shift based on community
feedback.

## 0.2

- [ ] `expectResource(uri)` and `expectPrompt(name, args)` chainable helpers
- [ ] Time-travel request/response log on the harness for advanced assertions
- [ ] Built-in `node:test`-friendly expect bridge (preserves `t.assert`)

## 0.3

- [ ] Optional streaming/SSE transport support in the contract CLI
- [ ] Snapshot testing for `listTools` / `listPrompts` output
- [ ] Coverage-style report of which tools/resources were exercised

## 1.0

- [ ] Stable public API with semantic-versioning guarantees
- [ ] Adapter recipes for Vitest, Jest, Bun test, and `node:test`
- [ ] Performance and concurrency hardening
- [ ] Guides for testing auth-elicitation and progressive-capability flows

## Beyond

- [ ] Transport-level fault injection (drops, timeouts, malformed frames)
- [ ] A hosted "MCP server health badge" powered by the contract tester

Feedback and contributions are welcome — open an issue to propose items.

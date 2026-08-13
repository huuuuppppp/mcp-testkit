# Examples

This directory contains runnable examples for `mcp-testkit`.

- **[vitest.example.ts](./vitest.example.ts)** — a complete unit test for a
  simple MCP tool server using `createTestKit` with Vitest.

To run the example yourself, scaffold a project and:

```bash
npm install --save-dev mcp-testkit @modelcontextprotocol/sdk zod vitest
npx vitest run
```

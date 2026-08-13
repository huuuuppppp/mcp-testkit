# Contributing to mcp-testkit

Thanks for your interest in contributing! This document describes how to set
up your environment, the standards we hold contributions to, and how to get
your change merged.

## Code of conduct

By participating you agree to uphold the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting started

You'll need **Node.js 18+** and npm.

```bash
git clone https://github.com/huuuuppppp/mcp-testkit.git
cd mcp-testkit
npm install
```

## Common tasks

```bash
npm run build        # Bundle ESM + CJS and emit type declarations
npm test             # Run the full test suite (vitest)
npm run test:watch   # Watch mode
npm run typecheck    # Type-check only
npm run lint         # Currently an alias for typecheck
```

All of these must pass before a PR is ready for review.

## Project layout

```
src/
  index.ts        Public API entry point
  harness.ts      In-process MCPTestKit (client + linked InMemoryTransport)
  assertions.ts   Framework-agnostic matchers + text helpers
  contract.ts     stdio contract tester (programmatic API)
  bin.ts          `mcp-testkit contract` CLI
tests/
  fixtures/       A minimal stdio MCP server used by contract tests
  *.test.ts       Vitest suites
```

## Coding standards

- **TypeScript strict mode.** No `any` unless justified with a comment.
- **Public APIs must have JSDoc.** Every exported function, class, and type
  should document its purpose, parameters, and behavior.
- **Tests are required** for new behavior. Aim for meaningful coverage of both
  the success and error paths.
- **No runtime dependencies beyond the MCP SDK and zod.** The library stays
  lightweight; dev dependencies are fine.
- **Keep the CLI stable.** Exit codes and output format are part of the
  contract users depend on in CI.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add response streaming support`
- `fix: handle empty content arrays in toBeText`
- `docs: clarify contract CLI exit codes`
- `test: cover schema validation errors`
- `chore: bump tsup`

Breaking changes must include `BREAKING CHANGE:` in the commit footer.

## Pull request process

1. Fork the repository and create a branch from `main`.
2. Make your change with tests and documentation updates.
3. Ensure `npm run build && npm test && npm run typecheck` all pass.
4. Open a PR using the pull request template.
5. A maintainer will review your change and may request changes.

We aim to review PRs within a week.

## Filing issues

- **Bugs:** use the bug report template and include reproduction steps, the
  version, and your environment.
- **Features:** open a feature request and describe the use case before
  submitting a large PR, so we can align on design.
- **Security vulnerabilities:** do **not** open a public issue — see
  [SECURITY.md](./SECURITY.md).

## Releasing (maintainers)

Releases are cut from `main` using semantic versioning. A maintainer opens a
release PR that updates `CHANGELOG.md` and bumps the version in
`package.json`, then merges it and tags the commit `vX.Y.Z`. The release
workflow publishes to npm and creates a GitHub Release.

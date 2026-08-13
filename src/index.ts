/**
 * mcp-testkit — type-safe, in-process testing toolkit for MCP servers.
 *
 * @packageDocumentation
 */

export {
  createTestKit,
  MCPTestKit,
  type ConnectableServer,
  type TestKitOptions,
  type CallToolOptions,
} from "./harness.js";

export {
  createExpectation,
  expectResult,
  text,
  textBlocks,
  structured,
  isErrorResult,
  type Expectation,
  type TextContentLike,
} from "./assertions.js";

export {
  runContract,
  type ContractOptions,
  type ContractResult,
  type ContractCheck,
} from "./contract.js";

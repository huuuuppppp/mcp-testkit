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
  type MockFeatureOptions,
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

export {
  SamplingMock,
  ElicitationMock,
  type SamplingResponder,
  type ElicitationResponder,
  type MockRequestExtra,
} from "./mocks.js";

export {
  expectNotification,
  isNotificationMessage,
  type CapturedNotification,
  type NotificationExpectation,
} from "./notifications.js";

export {
  expectResource,
  expectPrompt,
  type ResourceExpectation,
  type PromptExpectation,
} from "./content-assertions.js";

export {
  createSnapshotStore,
  SnapshotStore,
  type SnapshotOptions,
} from "./snapshot.js";

export { RequestLog, type RequestLogEntry, type RequestOutcome, type RequestDirection } from "./request-log.js";

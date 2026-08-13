/**
 * Optional bridge for Node's built-in test runner (`node --test`).
 *
 * `mcp-testkit` already works with `node:test` out of the box because its
 * assertions throw the global `AssertionError`, which `node:test` reports as a
 * first-class assertion failure. This module adds conveniences: automatic
 * teardown and snapshot persistence tied to a test context.
 *
 * @module
 */

import { createTestKit, type ConnectableServer, type TestKitOptions } from "./harness.js";
import {
  createSnapshotStore,
  type SnapshotOptions,
  type SnapshotStore,
} from "./snapshot.js";

/**
 * Minimal structural type for a `node:test` `TestContext`. We avoid importing
 * `node:test` directly so this module remains loadable in any environment.
 */
export interface NodeTestContext {
  after?: (fn: () => void | Promise<void>) => void;
  before?: (fn: () => void | Promise<void>) => void;
}

export interface NodeTestKit {
  /** A connected {@link MCPTestKit}, automatically closed after the test. */
  kit: Awaited<ReturnType<typeof createTestKit>>;
  /**
   * A snapshot store that is automatically saved after the test. Snapshot
   * files live under `__snapshots__/` unless overridden.
   */
  snapshots: SnapshotStore;
}

/**
 * Create a test kit and snapshot store bound to the given `node:test` context.
 * The kit is closed and snapshots are saved automatically when the test ends.
 *
 * @example
 * ```ts
 * import test from "node:test";
 * import assert from "node:assert";
 * import { withNodeTest } from "mcp-testkit/node-test";
 *
 * test("adds numbers", async (t) => {
 *   const { kit } = await withNodeTest(t, buildServer());
 *   const result = await kit.callTool("add", { a: 1, b: 2 });
 *   kit.expect(result).toBeText("3");
 * });
 * ```
 */
export async function withNodeTest(
  context: NodeTestContext,
  server: ConnectableServer,
  options?: TestKitOptions & { snapshots?: SnapshotOptions },
): Promise<NodeTestKit> {
  const kit = await createTestKit(server, options);
  const snapshots = createSnapshotStore(options?.snapshots);

  const cleanup = async () => {
    snapshots.save();
    if (!kit.isClosed) {
      await kit.close();
    }
  };

  if (context.after) {
    context.after(cleanup);
  } else {
    throw new Error(
      "withNodeTest requires a test context with an `after` hook",
    );
  }

  return { kit, snapshots };
}

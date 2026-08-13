import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withNodeTest, type NodeTestContext } from "../src/node-test.js";

function buildServer() {
  const server = new McpServer({ name: "nt", version: "1" });
  server.tool("ping", async () => ({
    content: [{ type: "text", text: "pong" }],
  }));
  return server;
}

function makeContext(): NodeTestContext & { afterFns: Array<() => unknown> } {
  const afterFns: Array<() => unknown> = [];
  return {
    after: (fn) => afterFns.push(fn),
    afterFns,
  };
}

describe("withNodeTest bridge", () => {
  it("connects a kit and registers auto-cleanup", async () => {
    const ctx = makeContext();
    const { kit } = await withNodeTest(ctx, buildServer());
    const result = await kit.callTool("ping", {});
    kit.expect(result).toBeText("pong");
    expect(kit.isClosed).toBe(false);

    for (const fn of ctx.afterFns) await fn();
    expect(kit.isClosed).toBe(true);
  });

  it("persists snapshots on cleanup", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bridge-"));
    try {
      const ctx = makeContext();
      const { snapshots } = await withNodeTest(ctx, buildServer(), {
        snapshots: { dir, file: "bridge.snap.json" },
      });
      snapshots.expect("answer", 42);
      for (const fn of ctx.afterFns) await fn();
      const { existsSync, readFileSync } = await import("node:fs");
      expect(existsSync(join(dir, "bridge.snap.json"))).toBe(true);
      expect(JSON.parse(readFileSync(join(dir, "bridge.snap.json"), "utf8"))).toEqual({ answer: 42 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws without an after hook", async () => {
    await expect(
      withNodeTest({} as NodeTestContext, buildServer()),
    ).rejects.toThrow(/after/);
  });
});

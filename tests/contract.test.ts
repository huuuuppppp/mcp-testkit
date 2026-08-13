import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runContract } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "fixtures", "echo-server.mjs");

describe("runContract (stdio)", () => {
  it("initializes, lists capabilities, and calls a tool", async () => {
    const result = await runContract({
      command: process.execPath,
      args: [fixture],
      calls: { echo: { message: "ping" } },
      timeoutMs: 15000,
    });

    expect(result.ok).toBe(true);
    expect(result.server).toMatchObject({
      name: "echo-fixture",
      version: "1.2.3",
    });
    expect(result.toolCount).toBe(2);
    expect(result.resourceCount).toBe(1);
    expect(result.promptCount).toBe(1);

    const names = result.checks.map((c) => c.name);
    expect(names).toContain("initialize");
    expect(names).toContain("ping");
    expect(names).toContain("listTools");
    expect(names).toContain("call:echo");
  });

  it("fails when a called tool returns an error", async () => {
    const result = await runContract({
      command: process.execPath,
      args: [fixture],
      calls: { boom: {} },
      timeoutMs: 15000,
    });

    expect(result.ok).toBe(false);
    const call = result.checks.find((c) => c.name === "call:boom");
    expect(call?.ok).toBe(false);
    expect(call?.detail).toContain("something went wrong");
  });

  it("returns a failure for a nonexistent command", async () => {
    const result = await runContract({
      command: "this-binary-does-not-exist-xyz",
      args: [],
      timeoutMs: 5000,
    });
    expect(result.ok).toBe(false);
    expect(result.error ?? result.checks.some((c) => !c.ok)).toBeTruthy();
  });
}, 30000);

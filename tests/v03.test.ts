import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestKit, expectResource, expectPrompt, type MCPTestKit } from "../src/index.js";
import { SnapshotStore } from "../src/snapshot.js";

function buildServer() {
  const server = new McpServer({ name: "v03", version: "1.0.0" });

  server.tool(
    "greet",
    { name: z.string() },
    async ({ name }) => ({
      content: [{ type: "text", text: `Hello, ${name}!` }],
    }),
  );

  server.resource("readme", "doc://readme", async (uri) => ({
    contents: [
      { uri: uri.href, mimeType: "text/markdown", text: "# Project\nBody" },
    ],
  }));

  server.resource(
    "binary",
    "file:///data.bin",
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/octet-stream", blob: "AAEC" }],
    }),
  );

  server.prompt(
    "summarize",
    "Summarize the given text",
    { text: z.string() },
    ({ text }) => ({
      description: `Summarize: ${text.slice(0, 20)}`,
      messages: [
        { role: "user", content: { type: "text", text: `Please summarize: ${text}` } },
        { role: "assistant", content: { type: "text", text: "Sure." } },
      ],
    }),
  );

  return server;
}

describe("request log", () => {
  let kit: MCPTestKit;
  beforeEach(async () => {
    kit = await createTestKit(buildServer());
  });
  afterEach(async () => {
    await kit.close();
  });

  it("records paired requests and responses with durations", async () => {
    await kit.callTool("greet", { name: "Ada" });
    await kit.listTools();

    const calls = kit.requestsFor("tools/call");
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.method).toBe("tools/call");
    expect(call.outcome).toBe("success");
    expect(call.id).toBeDefined();
    expect(call.params).toMatchObject({ name: "greet" });
    expect(call.result).toBeDefined();
    expect(call.durationMs).toEqual(expect.any(Number));
    expect(call.responseTimestamp).toBeGreaterThanOrEqual(call.requestTimestamp);

    expect(kit.requests.some((r) => r.method === "tools/list")).toBe(true);
  });

  it("records error outcomes for protocol-level failures", async () => {
    // Reading an unregistered resource yields a JSON-RPC error response.
    await expect(
      kit.readResource("test://does-not-exist"),
    ).rejects.toBeDefined();
    const errors = kit.requests.filter((r) => r.outcome === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.error?.message).toBeDefined();
    expect(errors[0]!.error?.code).toBeDefined();
  });
});

describe("expectResource", () => {
  let kit: MCPTestKit;
  beforeEach(async () => {
    kit = await createTestKit(buildServer());
  });
  afterEach(async () => {
    await kit.close();
  });

  it("asserts text content directly", async () => {
    const result = await kit.readResource("doc://readme");
    expectResource(result).toHaveContentCount(1).toContainText("Body").toHaveMimeType("text/markdown");
  });

  it("chains via kit.expectResource", async () => {
    (await kit.expectResource("doc://readme")).toHaveText("# Project\nBody");
  });

  it("detects binary blobs", async () => {
    const result = await kit.readResource("file:///data.bin");
    expectResource(result).toContainBlob().toHaveMimeType("application/octet-stream");
  });

  it("supports negation", async () => {
    const result = await kit.readResource("doc://readme");
    expectResource(result).not.toContainBlob();
    expect(() => expectResource(result).toContainBlob()).toThrow();
  });
});

describe("expectPrompt", () => {
  let kit: MCPTestKit;
  beforeEach(async () => {
    kit = await createTestKit(buildServer());
  });
  afterEach(async () => {
    await kit.close();
  });

  it("asserts messages and description", async () => {
    const result = await kit.getPrompt("summarize", { text: "a long body of text here" });
    expectPrompt(result)
      .toHaveMessageCount(2)
      .toHaveRole("assistant")
      .toContainText("a long body")
      .toHaveDescriptionContaining("a long body");
  });

  it("chains via kit.expectPrompt", async () => {
    (await kit.expectPrompt("summarize", { text: "hi" })).toHaveRole("user");
  });
});

describe("snapshots", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcp-snap-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes a snapshot on first run and matches on subsequent", () => {
    const s1 = new SnapshotStore({ dir, file: "t.snap.json" });
    s1.expect("tool", { name: "add", inputSchema: { type: "object" } });
    s1.save();

    const s2 = new SnapshotStore({ dir, file: "t.snap.json" });
    s2.expect("tool", { name: "add", inputSchema: { type: "object" } });
    s2.save();
    expect(existsSync(join(dir, "t.snap.json"))).toBe(true);
  });

  it("fails on mismatch", () => {
    const s1 = new SnapshotStore({ dir, file: "m.snap.json" });
    s1.expect("k", { a: 1 });
    s1.save();

    const s2 = new SnapshotStore({ dir, file: "m.snap.json" });
    expect(() => s2.expect("k", { a: 2 })).toThrow(/Snapshot mismatch/);
  });

  it("updates when UPDATE_SNAPSHOTS=1", () => {
    const s1 = new SnapshotStore({ dir, file: "u.snap.json" });
    s1.expect("k", { v: 1 });
    s1.save();

    process.env.UPDATE_SNAPSHOTS = "1";
    try {
      const s2 = new SnapshotStore({ dir, file: "u.snap.json" });
      s2.expect("k", { v: 2 });
      s2.save();
      const stored = JSON.parse(readFileSync(join(dir, "u.snap.json"), "utf8"));
      expect(stored.k).toEqual({ v: 2 });
    } finally {
      delete process.env.UPDATE_SNAPSHOTS;
    }
  });

  it("prunes unused keys", () => {
    const s1 = new SnapshotStore({ dir, file: "p.snap.json" });
    s1.expect("keep", 1);
    s1.expect("drop", 2);
    s1.save();

    const s2 = new SnapshotStore({ dir, file: "p.snap.json" });
    s2.expect("keep", 1);
    s2.pruneUnused();
    s2.save();
    const stored = JSON.parse(readFileSync(join(dir, "p.snap.json"), "utf8"));
    expect(stored).toEqual({ keep: 1 });
  });

  it("integrates with a kit to snapshot tool definitions", async () => {
    const kit = await createTestKit(buildServer());
    const snap = kit.snapshot({ dir, file: "tools.snap.json" });
    const tools = await kit.listTools();
    snap.expect("tools", tools.tools.map((t) => t.name));
    snap.save();
    await kit.close();

    const stored = JSON.parse(readFileSync(join(dir, "tools.snap.json"), "utf8"));
    expect(stored.tools).toEqual(["greet"]);
  });
});

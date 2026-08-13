// Run with: node examples/demo.mjs
import { createTestKit } from "../dist/index.js";
import { createTaskServer } from "./task-server.mjs";

let passed = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  const server = createTaskServer();
  const kit = await createTestKit(server);

  console.log("\n▸ mcp-testkit demo: task-server\n");

  // 1. Tool call with text + structured content
  console.log("1) Calling add_task...");
  const r1 = await kit.callTool("add_task", { title: "Write demo", priority: "high" });
  check("returns success text", () => kit.expect(r1).toBeSuccess().toContainText("#1"));
  check("returns structured id", () => kit.expect(r1).toMatchObject({ id: 1 }));

  await kit.callTool("add_task", { title: "Ship it" });

  // 2. List tools
  const { tools } = await kit.listTools();
  check("server exposes 4 tools", () => {
    if (tools.length !== 4) throw new Error(`expected 4 tools, got ${tools.length}`);
  });

  // 3. List tasks and inspect text
  const list = await kit.callTool("list_tasks", { status: "open" });
  kit.expect(list).toContainText("Write demo").toContainText("Ship it");
  check("list_tasks shows both open tasks", () => {});

  // 4. Error result path
  const bad = await kit.callTool("complete_task", { id: 999 });
  check("missing task returns an error result", () => kit.expect(bad).toBeError());

  // 5. Sampling mock — script the LLM response
  console.log("2) Mocking sampling/createMessage...");
  kit.sampling.respondWith({
    role: "assistant",
    model: "demo-model",
    content: { type: "text", text: "You have 2 open tasks: Write demo and Ship it." },
    stopReason: "endTurn",
  });
  const summary = await kit.callTool("summarize_tasks", {});
  check("tool returns the mocked LLM summary", () =>
    kit.expect(summary).toBeText("You have 2 open tasks: Write demo and Ship it."));
  check("server actually requested sampling", () => {
    const calls = kit.requestsFor("sampling/createMessage");
    if (calls.length !== 1) throw new Error("expected one sampling request");
  });

  // 6. Resources
  console.log("3) Reading resources...");
  (await kit.expectResource("tasks://all"))
    .toContainText("Write demo")
    .toHaveMimeType("application/json");
  check("tasks://all contains our task", () => {});

  // 7. Prompts
  const prompt = await kit.expectPrompt("daily_standup", { name: "Ada" });
  prompt.toHaveRole("user").toContainText("Hi Ada").toHaveMessageCount(1);
  check("daily_standup renders a personalized message", () => {});

  // 8. Notifications — add_task emits a logging notification
  console.log("4) Checking notifications...");
  kit.expectNotification("notifications/message").toBeSent();
  kit.expectNotification("notifications/message").toIncludeParams({ level: "info" });
  check("add_task emitted a logging notification", () => {});

  // 9. Request log shows all the calls we made
  console.log("5) Inspecting request log...");
  const methods = kit.requests.map((r) => r.method);
  check("request log records tools/call and sampling", () => {
    if (!methods.includes("tools/call")) throw new Error("missing tools/call");
    if (!methods.includes("sampling/createMessage")) throw new Error("missing sampling");
  });
  check("all recorded requests succeeded", () => {
    const errs = kit.requests.filter((r) => r.outcome === "error");
    if (errs.length) throw new Error(`${errs.length} requests failed: ${errs.map((e) => e.method).join(", ")}`);
  });

  await kit.close();

  console.log(`\n  All ${passed} checks passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

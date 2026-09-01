import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiTrigger } from "./pi.ts";
import { contributionSpy, eventHandlers } from "./test-support.ts";

test("maps normal settlement, errors, and aborts", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	createPiTrigger().register({ on: events.on } as ExtensionAPI, contributions);

	events.emit("agent_start", {});
	events.emit("message_end", { message: { role: "assistant", stopReason: "error" } });
	events.emit("agent_settled", {});
	events.emit("agent_start", {});
	events.emit("message_end", { message: { role: "assistant", stopReason: "aborted" } });
	events.emit("agent_settled", {});

	assert.deepEqual(calls.slice(0, 6), [
		{ action: "upsert", source: "pi", id: "idle", status: "idle" },
		{ action: "upsert", source: "pi", id: "main", status: "working" },
		{ action: "remove", source: "pi", id: "terminal" },
		{ action: "upsert", source: "pi", id: "terminal", status: "failed" },
		{ action: "remove", source: "pi", id: "main" },
		{ action: "upsert", source: "pi", id: "main", status: "working" },
	]);
	assert.equal(calls.at(-1)?.action, "remove");
});

test("tracks configured tools by call id", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	createPiTrigger(() => new Set(["plannotator_submit_plan"]))
		.register({ on: events.on } as ExtensionAPI, contributions);

	events.emit("tool_execution_start", { toolName: "bash", toolCallId: "other" });
	events.emit("tool_execution_start", { toolName: "plannotator_submit_plan", toolCallId: "one" });
	events.emit("tool_execution_start", { toolName: "plannotator_submit_plan", toolCallId: "two" });
	events.emit("tool_execution_end", { toolName: "plannotator_submit_plan", toolCallId: "one" });
	events.emit("tool_execution_end", { toolName: "plannotator_submit_plan", toolCallId: "two" });

	assert.deepEqual(calls.slice(1), [
		{ action: "upsert", source: "pi", id: "tool:one", status: "waiting" },
		{ action: "upsert", source: "pi", id: "tool:two", status: "waiting" },
		{ action: "remove", source: "pi", id: "tool:one" },
		{ action: "remove", source: "pi", id: "tool:two" },
	]);
});

test("uses the latest configured tool set", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	let waitingTools: ReadonlySet<string> = new Set();
	createPiTrigger(() => waitingTools).register({ on: events.on } as ExtensionAPI, contributions);

	events.emit("tool_execution_start", { toolName: "plannotator_submit_plan", toolCallId: "old" });
	waitingTools = new Set(["plannotator_submit_plan"]);
	events.emit("tool_execution_start", { toolName: "plannotator_submit_plan", toolCallId: "new" });

	assert.deepEqual(calls.slice(1), [
		{ action: "upsert", source: "pi", id: "tool:new", status: "waiting" },
	]);
});

test("clears stale configured tool waits when a new run starts", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	createPiTrigger(() => new Set(["plannotator_submit_plan"]))
		.register({ on: events.on } as ExtensionAPI, contributions);

	events.emit("tool_execution_start", { toolName: "plannotator_submit_plan", toolCallId: "stale" });
	events.emit("agent_start", {});

	assert.deepEqual(calls.slice(-3), [
		{ action: "upsert", source: "pi", id: "main", status: "working" },
		{ action: "remove", source: "pi", id: "terminal" },
		{ action: "remove", source: "pi", id: "tool:stale" },
	]);
});

test("maps native prompts to waiting", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	createPiTrigger().register({ on: events.on } as ExtensionAPI, contributions);

	events.emit("ui_prompt_start", {});
	events.emit("ui_prompt_end", {});

	assert.deepEqual(calls.slice(1), [
		{ action: "upsert", source: "pi", id: "prompt", status: "waiting" },
		{ action: "remove", source: "pi", id: "prompt" },
	]);
});

test("maps compaction to working until it completes or fails", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	createPiTrigger().register({ on: events.on } as ExtensionAPI, contributions);

	events.emit("session_before_compact", {});
	events.emit("session_compact", {});
	events.emit("session_before_compact", {});
	events.emit("session_compact_failed", {});

	assert.deepEqual(calls, [
		{ action: "upsert", source: "pi", id: "idle", status: "idle" },
		{ action: "upsert", source: "pi", id: "compaction", status: "working" },
		{ action: "remove", source: "pi", id: "compaction" },
		{ action: "upsert", source: "pi", id: "compaction", status: "working" },
		{ action: "remove", source: "pi", id: "compaction" },
	]);
});

test("disposal prevents stale Pi event handlers from restoring status", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	const dispose = createPiTrigger(() => new Set(["plannotator_submit_plan"]))
		.register({ on: events.on } as ExtensionAPI, contributions);
	dispose();
	events.emit("agent_start", {});
	events.emit("tool_execution_start", { toolName: "plannotator_submit_plan", toolCallId: "one" });
	events.emit("ui_prompt_start", {});

	assert.deepEqual(calls, [
		{ action: "upsert", source: "pi", id: "idle", status: "idle" },
		{ action: "clearSource", source: "pi" },
	]);
});

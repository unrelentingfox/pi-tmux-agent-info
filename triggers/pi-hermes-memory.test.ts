import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { piHermesMemoryTrigger } from "./pi-hermes-memory.ts";
import { contributionSpy, eventHandlers } from "./test-support.ts";

test("maps every public Hermes tool execution to working status", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	piHermesMemoryTrigger.register({ on: events.on } as ExtensionAPI, contributions);

	const tools = ["memory_add", "memory_replace", "memory_remove", "memory_search", "session_search", "skill_manage"];
	for (const [index, toolName] of tools.entries()) {
		const toolCallId = `call-${index}`;
		events.emit("tool_execution_start", { toolName, toolCallId });
		events.emit("tool_execution_end", { toolName, toolCallId, isError: false });
	}

	for (const [index] of tools.entries()) {
		const offset = index * 2;
		assert.deepEqual(calls.slice(offset, offset + 2), [
			{ action: "upsert", source: "pi-hermes-memory-tools", id: `call-${index}`, status: "working" },
			{ action: "remove", source: "pi-hermes-memory-tools", id: `call-${index}` },
		]);
	}
});

test("keeps keyed Hermes failures until the next Hermes tool starts", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	piHermesMemoryTrigger.register({ on: events.on } as ExtensionAPI, contributions);

	events.emit("tool_execution_start", { toolName: "session_search", toolCallId: "call-1" });
	events.emit("tool_execution_end", { toolName: "session_search", toolCallId: "call-1", isError: true });
	events.emit("tool_execution_start", { toolName: "skill_manage", toolCallId: "call-2" });

	assert.deepEqual(calls, [
		{ action: "upsert", source: "pi-hermes-memory-tools", id: "call-1", status: "working" },
		{ action: "remove", source: "pi-hermes-memory-tools", id: "call-1" },
		{ action: "upsert", source: "pi-hermes-memory-tools", id: "failure:call-1", status: "failed" },
		{ action: "remove", source: "pi-hermes-memory-tools", id: "failure:call-1" },
		{ action: "upsert", source: "pi-hermes-memory-tools", id: "call-2", status: "working" },
	]);
});

test("ignores non-Hermes tools and clears state on disposal", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	const dispose = piHermesMemoryTrigger.register({ on: events.on } as ExtensionAPI, contributions);

	events.emit("tool_execution_start", { toolName: "bash", toolCallId: "call-1" });
	dispose();
	events.emit("tool_execution_start", { toolName: "memory_remove", toolCallId: "call-2" });

	assert.deepEqual(calls, [
		{ action: "clearSource", source: "pi-hermes-memory-tools" },
	]);
});

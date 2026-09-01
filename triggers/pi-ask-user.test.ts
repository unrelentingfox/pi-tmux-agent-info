import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { piAskUserTrigger } from "./pi-ask-user.ts";
import { contributionSpy, eventHandlers } from "./test-support.ts";

test("tracks overlapping ask_user prompts by tool call id", () => {
	const events = eventHandlers();
	const pi = { on: events.on } as ExtensionAPI;
	const { contributions, calls } = contributionSpy();
	const dispose = piAskUserTrigger.register(pi, contributions);
	events.emit("tool_execution_start", { toolName: "ask_user", toolCallId: "ask-1" });
	events.emit("tool_execution_start", { toolName: "ask_user", toolCallId: "ask-2" });
	events.emit("tool_execution_end", { toolName: "ask_user", toolCallId: "ask-1" });
	events.emit("tool_execution_end", { toolName: "ask_user", toolCallId: "ask-2" });
	dispose();
	assert.deepEqual(calls, [
		{ action: "upsert", source: "pi-ask-user", id: "ask-1", status: "waiting" },
		{ action: "upsert", source: "pi-ask-user", id: "ask-2", status: "waiting" },
		{ action: "remove", source: "pi-ask-user", id: "ask-1" },
		{ action: "remove", source: "pi-ask-user", id: "ask-2" },
		{ action: "clearSource", source: "pi-ask-user" },
	]);
});

test("disposal prevents stale ask_user event handlers from restoring status", () => {
	const events = eventHandlers();
	const pi = { on: events.on } as ExtensionAPI;
	const { contributions, calls } = contributionSpy();
	const dispose = piAskUserTrigger.register(pi, contributions);
	dispose();
	events.emit("tool_execution_start", { toolName: "ask_user", toolCallId: "ask-1" });

	assert.deepEqual(calls, [{ action: "clearSource", source: "pi-ask-user" }]);
});

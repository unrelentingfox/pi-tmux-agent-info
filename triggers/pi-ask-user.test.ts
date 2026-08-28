import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { piAskUserTrigger } from "./pi-ask-user.ts";
import { contributionSpy, eventHandlers } from "./test-support.ts";

test("tracks ask_user by tool call id", () => {
	const events = eventHandlers();
	const pi = { on: events.on } as ExtensionAPI;
	const { contributions, calls } = contributionSpy();
	const dispose = piAskUserTrigger.register(pi, contributions);
	events.emit("tool_execution_start", { toolName: "ask_user", toolCallId: "ask-1" });
	events.emit("tool_execution_end", { toolName: "ask_user", toolCallId: "ask-1" });
	dispose();
	assert.deepEqual(calls, [
		{ action: "upsert", source: "pi-ask-user", id: "ask-1", status: "waiting" },
		{ action: "remove", source: "pi-ask-user", id: "ask-1" },
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

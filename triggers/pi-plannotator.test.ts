import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { piPlannotatorTrigger } from "./pi-plannotator.ts";
import { contributionSpy, eventHandlers } from "./test-support.ts";

test("tracks overlapping browser plan reviews by tool call id", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	const dispose = piPlannotatorTrigger.register({ on: events.on } as ExtensionAPI, contributions);

	events.emit("tool_execution_start", { toolName: "plannotator_submit_plan", toolCallId: "plan-1" });
	events.emit("tool_execution_start", { toolName: "plannotator_submit_plan", toolCallId: "plan-2" });
	events.emit("tool_execution_end", { toolName: "plannotator_submit_plan", toolCallId: "plan-1" });
	events.emit("tool_execution_end", { toolName: "plannotator_submit_plan", toolCallId: "plan-2" });
	dispose();

	assert.deepEqual(calls, [
		{ action: "upsert", source: "pi-plannotator", id: "plan-1", status: "waiting" },
		{ action: "upsert", source: "pi-plannotator", id: "plan-2", status: "waiting" },
		{ action: "remove", source: "pi-plannotator", id: "plan-1" },
		{ action: "remove", source: "pi-plannotator", id: "plan-2" },
		{ action: "clearSource", source: "pi-plannotator" },
	]);
});

test("ignores other planning and execution tools", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	piPlannotatorTrigger.register({ on: events.on } as ExtensionAPI, contributions);

	events.emit("tool_execution_start", { toolName: "bash", toolCallId: "call-1" });
	events.emit("tool_execution_start", { toolName: "ask_user", toolCallId: "call-2" });
	events.emit("tool_execution_end", { toolName: "bash", toolCallId: "call-1" });

	assert.deepEqual(calls, []);
});

test("disposal prevents stale plan review events from restoring status", () => {
	const events = eventHandlers();
	const { contributions, calls } = contributionSpy();
	const dispose = piPlannotatorTrigger.register({ on: events.on } as ExtensionAPI, contributions);
	dispose();
	events.emit("tool_execution_start", { toolName: "plannotator_submit_plan", toolCallId: "plan-1" });

	assert.deepEqual(calls, [{ action: "clearSource", source: "pi-plannotator" }]);
});

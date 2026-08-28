import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { piTrigger } from "./pi.ts";
import { contributionSpy, eventHandlers } from "./test-support.ts";

test("maps normal settlement, errors, and aborts", () => {
	const events = eventHandlers();
	const pi = { on: events.on } as ExtensionAPI;
	const { contributions, calls } = contributionSpy();
	piTrigger.register(pi, contributions);

	events.emit("agent_start", {});
	events.emit("message_end", { message: { role: "assistant", stopReason: "error" } });
	events.emit("agent_settled", {});
	events.emit("agent_start", {});
	events.emit("message_end", { message: { role: "assistant", stopReason: "aborted" } });
	events.emit("agent_settled", {});

	assert.deepEqual(calls.slice(0, 6), [
		{ action: "upsert", source: "pi", id: "idle", status: "idle" },
		{ action: "clearStatuses", statuses: ["done", "failed"] },
		{ action: "upsert", source: "pi", id: "main", status: "working" },
		{ action: "remove", source: "pi", id: "main" },
		{ action: "upsert", source: "pi", id: "terminal", status: "failed" },
		{ action: "clearStatuses", statuses: ["done", "failed"] },
	]);
	assert.equal(calls.at(-1)?.action, "remove");
});

test("maps compaction to working until it completes or fails", () => {
	const events = eventHandlers();
	const pi = { on: events.on } as ExtensionAPI;
	const { contributions, calls } = contributionSpy();
	piTrigger.register(pi, contributions);

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
	const pi = { on: events.on } as ExtensionAPI;
	const { contributions, calls } = contributionSpy();
	const dispose = piTrigger.register(pi, contributions);
	dispose();
	events.emit("agent_start", {});
	events.emit("session_before_compact", {});

	assert.deepEqual(calls, [
		{ action: "upsert", source: "pi", id: "idle", status: "idle" },
		{ action: "clearSource", source: "pi" },
	]);
});

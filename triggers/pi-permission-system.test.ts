import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { piPermissionSystemTrigger } from "./pi-permission-system.ts";
import { contributionSpy } from "./test-support.ts";

function eventPi(): { pi: ExtensionAPI; emit(channel: string, payload: unknown): void } {
	const handlers = new Map<string, (payload: unknown) => void>();
	return {
		pi: { events: { on: (channel: string, handler: (payload: unknown) => void) => {
			handlers.set(channel, handler);
			return () => handlers.delete(channel);
		} } } as ExtensionAPI,
		emit: (channel, payload) => handlers.get(channel)?.(payload),
	};
}

test("tracks permission prompts by request id", () => {
	const { pi, emit } = eventPi();
	const { contributions, calls } = contributionSpy();
	const dispose = piPermissionSystemTrigger.register(pi, contributions);
	emit("permissions:ui_prompt", { requestId: "one" });
	emit("permissions:ui_prompt", { requestId: "two" });
	emit("permissions:decision", { requestId: "one" });
	dispose();
	assert.deepEqual(calls, [
		{ action: "upsert", source: "pi-permission-system", id: "one", status: "waiting" },
		{ action: "upsert", source: "pi-permission-system", id: "two", status: "waiting" },
		{ action: "remove", source: "pi-permission-system", id: "one" },
		{ action: "clearSource", source: "pi-permission-system" },
	]);
});

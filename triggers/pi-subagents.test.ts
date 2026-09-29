import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listOwnedActiveRuns, piSubagentsTrigger } from "./pi-subagents.ts";
import { registerStatusTriggers } from "./index.ts";
import { contributionSpy } from "./test-support.ts";

function writeRun(root: string, id: string, sessionId: string, state: string): void {
	const runDir = join(root, id);
	mkdirSync(runDir, { recursive: true });
	writeFileSync(join(runDir, "status.json"), JSON.stringify({
		runId: id,
		sessionId,
		state,
		mode: "single",
		startedAt: Date.now(),
		steps: [],
	}));
}

function withTempRoot(action: (root: string) => void | Promise<void>): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), "tmux-agent-info-"));
	const previousRoot = process.env.PI_SUBAGENTS_TEMP_ROOT;
	process.env.PI_SUBAGENTS_TEMP_ROOT = root;
	return Promise.resolve(action(root)).finally(() => {
		if (previousRoot === undefined) delete process.env.PI_SUBAGENTS_TEMP_ROOT;
		else process.env.PI_SUBAGENTS_TEMP_ROOT = previousRoot;
		rmSync(root, { recursive: true, force: true });
	});
}

test("lists only active runs owned by the current session", async () => {
	await withTempRoot((root) => {
		const asyncRoot = join(root, "async-subagent-runs");
		writeRun(asyncRoot, "owned-active", "/sessions/current.jsonl", "running");
		writeRun(asyncRoot, "other-active", "/sessions/other.jsonl", "running");
		writeRun(asyncRoot, "queued-owned", "/sessions/current.jsonl", "queued");
		writeRun(asyncRoot, "terminal", "/sessions/current.jsonl", "complete");
		writeRun(asyncRoot, "unmarked-historical", "/sessions/current.jsonl", "running");
		mkdirSync(join(asyncRoot, ".active-runs"), { recursive: true });
		for (const id of ["owned-active", "other-active", "queued-owned", "terminal"]) {
			writeFileSync(join(asyncRoot, ".active-runs", id), "");
		}
		assert.deepEqual(listOwnedActiveRuns("/sessions/current.jsonl"), ["owned-active", "queued-owned"]);
	});
});

test("a stale active marker does not make a terminal run active", async () => {
	await withTempRoot((root) => {
		const asyncRoot = join(root, "async-subagent-runs");
		writeRun(asyncRoot, "dead-process", "/sessions/current.jsonl", "complete");
		mkdirSync(join(asyncRoot, ".active-runs"), { recursive: true });
		writeFileSync(join(asyncRoot, ".active-runs", "dead-process"), "");
		assert.deepEqual(listOwnedActiveRuns("/sessions/current.jsonl"), []);
	});
});

test("publishes and removes background status as owned runs change", async () => {
	await withTempRoot(async (root) => {
		const asyncRoot = join(root, "async-subagent-runs");
		writeRun(asyncRoot, "finished", "/sessions/current.jsonl", "running");
		mkdirSync(join(asyncRoot, ".active-runs"), { recursive: true });
		writeFileSync(join(asyncRoot, ".active-runs", "finished"), "");

		const registeredHandlers = new Map<string, Array<(event: any, context: any) => void | Promise<void>>>();
		const { contributions, calls } = contributionSpy();
		const pi = {
			on(event: string, handler: (value: any, context: any) => void | Promise<void>) {
				const list = registeredHandlers.get(event) ?? [];
				list.push(handler);
				registeredHandlers.set(event, list);
			},
		};
		const context = { sessionManager: { getSessionFile: () => "/sessions/current.jsonl" } };
		registerStatusTriggers(pi as never, contributions, context as never, () => new Set(), [piSubagentsTrigger]);
		const sessionStart = registeredHandlers.get("session_start")?.[0];
		const sessionShutdown = registeredHandlers.get("session_shutdown")?.[0];
		await sessionStart?.({}, context);
		assert.ok(calls.some((call) => call.action === "upsert" && call.source === "ext:pi-subagents" && call.id === "background-runs" && call.status === "working"));

		writeRun(asyncRoot, "finished", "/sessions/current.jsonl", "complete");
		await sessionStart?.({}, context);
		assert.equal(calls.some((call) => call.action === "remove" && call.source === "ext:pi-subagents" && call.id === "background-runs"), true);
		await sessionShutdown?.({}, context);
	});
});

test("registers core and protocol triggers when pi-subagents status data is absent", () => {
	const registeredEvents = new Set<string>();
	const { contributions, calls } = contributionSpy();
	const pi = {
		on(event: string) {
			registeredEvents.add(event);
		},
		events: { on: () => () => undefined },
	};
	const dispose = registerStatusTriggers(pi as never, contributions, {
		sessionManager: { getSessionFile: () => "/sessions/current.jsonl" },
	} as never);

	assert.ok(registeredEvents.has("agent_start"));
	assert.ok(registeredEvents.has("session_start"));
	assert.ok(calls.some((call) => call.action === "upsert" && call.source === "pi" && call.id === "idle"));
	assert.equal(calls.some((call) => call.source === "ext:pi-subagents"), false);
	dispose();
});

import assert from "node:assert/strict";
import test from "node:test";
import piTmuxAgentInfo, {
	agentInfoCommands,
	clearAgentInfoCommands,
	statusOptionCommands,
} from "./index.ts";
import { eventHandlers } from "./triggers/test-support.ts";

function extensionPi(sessionName: string | undefined): {
	pi: any;
	events: ReturnType<typeof eventHandlers>;
	handlerCount(event?: string): number;
	run(event: string, payload?: unknown): Promise<void>;
	tmuxCommands: string[][];
} {
	const handlers = new Map<string, Array<(value: any) => void | Promise<void>>>();
	const events = eventHandlers();
	const tmuxCommands: string[][] = [];
	return {
		pi: {
			on(event: string, handler: (value: any) => void | Promise<void>) {
				const registered = handlers.get(event) ?? [];
				registered.push(handler);
				handlers.set(event, registered);
			},
			events: { on: events.on },
			exec: async (command: string, args: string[]) => {
				assert.equal(command, "tmux");
				tmuxCommands.push(args);
			},
			getSessionName: () => sessionName,
		},
		events,
		handlerCount: (event) => event ? (handlers.get(event)?.length ?? 0) : [...handlers.values()].flat().length,
		run: async (event, payload = {}) => {
			for (const handler of handlers.get(event) ?? []) await handler(payload);
		},
		tmuxCommands,
	};
}

function withEnvironment(value: Record<string, string | undefined>, action: () => void | Promise<void>): Promise<void> {
	const previous = new Map(Object.keys(value).map((key) => [key, process.env[key]]));
	for (const [key, setting] of Object.entries(value)) {
		if (setting === undefined) delete process.env[key];
		else process.env[key] = setting;
	}
	return Promise.resolve(action()).finally(() => {
		for (const [key, setting] of previous) {
			if (setting === undefined) delete process.env[key];
			else process.env[key] = setting;
		}
	});
}

function assertSnapshot(commands: string[][], sessionName: string | undefined): void {
	assert.deepEqual(commands.slice(-3), agentInfoCommands("%42", "pi", sessionName, "idle"));
}

test("sets structured agent identity and status", () => {
	assert.deepEqual(agentInfoCommands("%42", "pi", "Review tmux", "working"), [
		["set-option", "-p", "-t", "%42", "@agent_harness", "pi"],
		["set-option", "-p", "-t", "%42", "@agent_session_name", "Review tmux"],
		["set-option", "-p", "-t", "%42", "@agent_status", "working"],
	]);
});

test("passes shell-special names as one tmux argument", () => {
	const commands = agentInfoCommands("%42", "pi", 'name "$(touch /tmp/unwanted)"', undefined);
	assert.equal(commands[1]?.at(-1), 'name "$(touch /tmp/unwanted)"');
});

test("unsets optional empty values", () => {
	assert.deepEqual(agentInfoCommands("%42", "pi", undefined, undefined), [
		["set-option", "-p", "-t", "%42", "@agent_harness", "pi"],
		["set-option", "-p", "-u", "-t", "%42", "@agent_session_name"],
		["set-option", "-p", "-u", "-t", "%42", "@agent_status"],
	]);
});

test("updates status without changing main agent identity", () => {
	assert.deepEqual(statusOptionCommands("%42", "attention"), [
		["set-option", "-p", "-t", "%42", "@agent_status", "attention"],
	]);
	assert.deepEqual(statusOptionCommands("%42", "idle"), [
		["set-option", "-p", "-t", "%42", "@agent_status", "idle"],
	]);
});

test("clears every agent field on shutdown", () => {
	assert.deepEqual(clearAgentInfoCommands("%42"), [
		["set-option", "-p", "-u", "-t", "%42", "@agent_harness"],
		["set-option", "-p", "-u", "-t", "%42", "@agent_session_name"],
		["set-option", "-p", "-u", "-t", "%42", "@agent_status"],
	]);
});

test("does not register handlers, subscriptions, or tmux commands in child mode", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: "1", TMUX_PANE: "%42" }, async () => {
		const { pi, events, handlerCount, run, tmuxCommands } = extensionPi("child");
		piTmuxAgentInfo(pi);
		assert.equal(handlerCount(), 0);
		assert.equal(events.totalCount(), 0);
		await run("session_start");
		assert.deepEqual(tmuxCommands, []);
	});
});

test("parent mode registers lifecycle handlers and status subscriptions", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, () => {
		const { pi, events, handlerCount } = extensionPi("parent");
		piTmuxAgentInfo(pi);
		assert.ok(handlerCount() > 0);
		assert.ok(events.totalCount() > 0);
		assert.equal(events.count("permissions:ui_prompt"), 1);
	});
});

for (const [lifecycle, sessionName] of [
	["startup", "start"],
	["reload", "reload"],
	["new", "new"],
	["resume/reopen", "resumed"],
	["fork", "forked"],
] as const) {
	test(`republishes a full pane snapshot on ${lifecycle}`, async () => {
		await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, async () => {
			const { pi, run, tmuxCommands } = extensionPi(sessionName);
			piTmuxAgentInfo(pi);
			await run("session_start");
			assertSnapshot(tmuxCommands, sessionName);
		});
	});
}

test("removes a stale session name during session-start republish", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, async () => {
		const { pi, run, tmuxCommands } = extensionPi(undefined);
		piTmuxAgentInfo(pi);
		await run("session_start");
		assertSnapshot(tmuxCommands, undefined);
	});
});

test("does not register status triggers again for repeated session starts", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, async () => {
		const { pi, handlerCount, run } = extensionPi("test");
		piTmuxAgentInfo(pi);
		assert.equal(handlerCount("agent_start"), 1);
		await run("session_start");
		await run("session_start");
		assert.equal(handlerCount("agent_start"), 1);
	});
});

test("does nothing outside tmux", () => {
	assert.deepEqual(agentInfoCommands(undefined, "pi", "name", "done"), []);
	assert.deepEqual(statusOptionCommands(undefined, "done"), []);
	assert.deepEqual(clearAgentInfoCommands(undefined), []);
});

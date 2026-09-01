import assert from "node:assert/strict";
import test from "node:test";
import piTmuxAgentInfo, {
	agentInfoCommands,
	clearAgentInfoCommands,
	isInteractiveParentSession,
	statusOptionCommands,
} from "./index.ts";
import { eventHandlers } from "./triggers/test-support.ts";

function extensionPi(sessionName: string | undefined, mode = "tui"): {
	pi: any;
	events: ReturnType<typeof eventHandlers>;
	handlerCount(event?: string): number;
	run(event: string, payload?: unknown): Promise<void>;
	tmuxCommands: string[][];
	warnings: string[];
} {
	const handlers = new Map<string, Array<(value: any, ctx: any) => void | Promise<void>>>();
	const events = eventHandlers();
	const tmuxCommands: string[][] = [];
	const warnings: string[] = [];
	const ctx = { mode, ui: { notify: (message: string) => warnings.push(message) } };
	return {
		pi: {
			on(event: string, handler: (value: any, ctx: any) => void | Promise<void>) {
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
			for (const handler of handlers.get(event) ?? []) await handler(payload, ctx);
		},
		tmuxCommands,
		warnings,
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
});

test("clears every agent field on shutdown", () => {
	assert.deepEqual(clearAgentInfoCommands("%42"), [
		["set-option", "-p", "-u", "-t", "%42", "@agent_harness"],
		["set-option", "-p", "-u", "-t", "%42", "@agent_session_name"],
		["set-option", "-p", "-u", "-t", "%42", "@agent_status"],
	]);
});

test("a stale extension generation cannot clear the current pane owner", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, async () => {
		const stale = extensionPi("stale");
		piTmuxAgentInfo(stale.pi, () => ({ waitingTools: new Set(), warnings: [] }));
		await stale.run("session_start");

		const current = extensionPi("current");
		piTmuxAgentInfo(current.pi, () => ({ waitingTools: new Set(), warnings: [] }));
		await current.run("session_start");
		const staleCommandCount = stale.tmuxCommands.length;

		await stale.run("session_shutdown", { reason: "quit" });
		await stale.run("agent_start");
		assert.equal(stale.tmuxCommands.length, staleCommandCount);
		assertSnapshot(current.tmuxCommands, "current");
	});
});

test("clears pane options only on actual quit", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, async () => {
		const replacement = extensionPi("replacement");
		piTmuxAgentInfo(replacement.pi, () => ({ waitingTools: new Set(), warnings: [] }));
		await replacement.run("session_start");
		await replacement.run("session_shutdown", { reason: "reload" });
		assert.equal(replacement.tmuxCommands.some((command) => command.includes("@agent_harness") && command.includes("-u")), false);

		const quitting = extensionPi("quitting");
		piTmuxAgentInfo(quitting.pi, () => ({ waitingTools: new Set(), warnings: [] }));
		await quitting.run("session_start");
		await quitting.run("session_shutdown", { reason: "quit" });
		assert.deepEqual(quitting.tmuxCommands.slice(-3), clearAgentInfoCommands("%42"));
	});
});

test("authorizes only an interactive parent session", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined }, () => {
		assert.equal(isInteractiveParentSession("tui"), true);
		assert.equal(isInteractiveParentSession("rpc"), false);
		assert.equal(isInteractiveParentSession("json"), false);
		assert.equal(isInteractiveParentSession("print"), false);
		assert.equal(isInteractiveParentSession(undefined), false);
	});
	await withEnvironment({ PI_SUBAGENT_CHILD: "1" }, () => {
		assert.equal(isInteractiveParentSession("tui"), false);
	});
});

test("an RPC Pi process never registers status triggers or writes the tmux pane", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, async () => {
		const rpc = extensionPi("rpc", "rpc");
		piTmuxAgentInfo(rpc.pi, () => ({ waitingTools: new Set(), warnings: [] }));
		await rpc.run("session_start");
		assert.equal(rpc.handlerCount("agent_start"), 0);
		assert.equal(rpc.events.totalCount(), 0);
		await rpc.run("agent_start");
		await rpc.run("session_shutdown", { reason: "quit" });
		assert.deepEqual(rpc.tmuxCommands, []);
	});
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

test("parent mode registers only core lifecycle and protocol subscriptions", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, async () => {
		const { pi, events, handlerCount, run } = extensionPi("parent");
		piTmuxAgentInfo(pi);
		assert.equal(handlerCount("agent_start"), 0);
		await run("session_start");
		assert.ok(handlerCount() > 0);
		assert.equal(events.totalCount(), 1);
		assert.equal(events.count("tmux-agent-status:v1"), 1);
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
			piTmuxAgentInfo(pi, () => ({ waitingTools: new Set(), warnings: [] }));
			await run("session_start");
			assertSnapshot(tmuxCommands, sessionName);
		});
	});
}

test("removes a stale session name during session-start republish", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, async () => {
		const { pi, run, tmuxCommands } = extensionPi(undefined);
		piTmuxAgentInfo(pi, () => ({ waitingTools: new Set(), warnings: [] }));
		await run("session_start");
		assertSnapshot(tmuxCommands, undefined);
	});
});

test("publishes working without an idle flicker on a later agent start", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, async () => {
		const { pi, run, tmuxCommands } = extensionPi("test");
		piTmuxAgentInfo(pi, () => ({ waitingTools: new Set(), warnings: [] }));
		await run("session_start");
		await run("agent_start");
		await run("agent_settled");
		await run("agent_start");
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(
			tmuxCommands.filter((command) => command.includes("@agent_status")).map((command) => command.at(-1)).slice(-2),
			["done", "working"],
		);
	});
});

test("drives working, configured waiting, working, and done tmux states", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, async () => {
		const { pi, run, tmuxCommands } = extensionPi("test");
		piTmuxAgentInfo(pi, () => ({
			waitingTools: new Set(["plannotator_submit_plan"]),
			warnings: [],
		}));
		await run("session_start");
		await run("agent_start");
		await run("tool_execution_start", { toolName: "plannotator_submit_plan", toolCallId: "plan" });
		await run("tool_execution_end", { toolName: "plannotator_submit_plan", toolCallId: "plan" });
		await run("agent_settled");
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(
			tmuxCommands.filter((command) => command.includes("@agent_status")).map((command) => command.at(-1)).slice(-4),
			["working", "waiting", "working", "done"],
		);
	});
});

test("reloads configured waiting tools on every session start", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, async () => {
		const { pi, run, tmuxCommands, warnings } = extensionPi("test");
		let waitingTools: ReadonlySet<string> = new Set();
		piTmuxAgentInfo(pi, () => ({ waitingTools, warnings: ["test warning"] }));
		await run("session_start");
		await run("tool_execution_start", { toolName: "plannotator_submit_plan", toolCallId: "before" });
		waitingTools = new Set(["plannotator_submit_plan"]);
		await run("session_start");
		await run("tool_execution_start", { toolName: "plannotator_submit_plan", toolCallId: "after" });
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(tmuxCommands.filter((command) => command.at(-1) === "waiting").length, 1);
		assert.deepEqual(warnings, ["tmux-agent-info: test warning", "tmux-agent-info: test warning"]);
	});
});

test("does not register status triggers again for repeated session starts", async () => {
	await withEnvironment({ PI_SUBAGENT_CHILD: undefined, TMUX_PANE: "%42" }, async () => {
		const { pi, handlerCount, run } = extensionPi("test");
		piTmuxAgentInfo(pi, () => ({ waitingTools: new Set(), warnings: [] }));
		assert.equal(handlerCount("agent_start"), 0);
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

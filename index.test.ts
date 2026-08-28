import assert from "node:assert/strict";
import test from "node:test";
import piTmuxAgentInfo, {
	agentInfoCommands,
	clearAgentInfoCommands,
	statusOptionCommands,
} from "./index.ts";
import { eventHandlers } from "./triggers/test-support.ts";

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

test("subagent status updates do not change main agent identity", () => {
	assert.deepEqual(statusOptionCommands("%42", "working"), [
		["set-option", "-p", "-t", "%42", "@agent_status", "working"],
	]);
});

test("does not register status triggers again for repeated session starts", () => {
	const previousChildFlag = process.env.PI_SUBAGENT_CHILD;
	delete process.env.PI_SUBAGENT_CHILD;
	try {
		const events = eventHandlers();
		const pi = {
			on: events.on,
			events: { on: () => undefined },
			exec: async () => undefined,
			getSessionName: () => "test",
		};
		piTmuxAgentInfo(pi as any);

		assert.equal(events.count("agent_start"), 1);
		events.emit("session_start", {});
		events.emit("session_start", {});
		assert.equal(events.count("agent_start"), 1);
	} finally {
		if (previousChildFlag === undefined) delete process.env.PI_SUBAGENT_CHILD;
		else process.env.PI_SUBAGENT_CHILD = previousChildFlag;
	}
});

test("does nothing outside tmux", () => {
	assert.deepEqual(agentInfoCommands(undefined, "pi", "name", "done"), []);
	assert.deepEqual(statusOptionCommands(undefined, "done"), []);
	assert.deepEqual(clearAgentInfoCommands(undefined), []);
});

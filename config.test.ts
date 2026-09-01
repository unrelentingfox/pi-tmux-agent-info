import assert from "node:assert/strict";
import test from "node:test";
import { loadTmuxAgentInfoConfig } from "./config.ts";

const PATH = "/config/tmux-agent-info.json";

test("uses no waiting tools when config or key is absent", () => {
	const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
	assert.deepEqual(loadTmuxAgentInfoConfig(PATH, () => { throw missing; }), {
		waitingTools: new Set(),
		warnings: [],
	});
	assert.deepEqual(loadTmuxAgentInfoConfig(PATH, () => "{}"), {
		waitingTools: new Set(),
		warnings: [],
	});
});

test("loads unique non-empty waiting tool names", () => {
	assert.deepEqual(
		loadTmuxAgentInfoConfig(PATH, () => JSON.stringify({
			waitingTools: [" plannotator_submit_plan ", "", 42, "plannotator_submit_plan"],
		})),
		{
			waitingTools: new Set(["plannotator_submit_plan"]),
			warnings: [
				`${PATH}: ignored invalid waitingTools entries.`,
				`${PATH}: removed duplicate waitingTools entries.`,
			],
		},
	);
});

test("accepts an explicit empty waiting tool list", () => {
	assert.deepEqual(loadTmuxAgentInfoConfig(PATH, () => '{"waitingTools":[]}'), {
		waitingTools: new Set(),
		warnings: [],
	});
});

test("warns and falls back to no waiting tools for invalid config", () => {
	const malformed = loadTmuxAgentInfoConfig(PATH, () => "{");
	assert.deepEqual(malformed.waitingTools, new Set());
	assert.equal(malformed.warnings.length, 1);
	assert.match(malformed.warnings[0] ?? "", new RegExp(`^Cannot parse ${PATH}: `));
	assert.deepEqual(loadTmuxAgentInfoConfig(PATH, () => '{"waitingTools":"plan"}'), {
		waitingTools: new Set(),
		warnings: [`${PATH}: waitingTools must be an array of tool names.`],
	});
});

test("warns and falls back when config cannot be read", () => {
	const denied = Object.assign(new Error("denied"), { code: "EACCES" });
	assert.deepEqual(loadTmuxAgentInfoConfig(PATH, () => { throw denied; }), {
		waitingTools: new Set(),
		warnings: [`Cannot read ${PATH}: denied`],
	});
});

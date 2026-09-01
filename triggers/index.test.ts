import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerStatusTriggers } from "./index.ts";
import { contributionSpy } from "./test-support.ts";
import type { StatusTrigger } from "./types.ts";

test("registers every trigger and disposes in reverse order", () => {
	const order: string[] = [];
	const trigger = (source: string): StatusTrigger => ({
		source,
		register: () => {
			order.push(`register:${source}`);
			return () => order.push(`dispose:${source}`);
		},
	});
	const { contributions } = contributionSpy();
	const dispose = registerStatusTriggers(
		{} as ExtensionAPI,
		contributions,
		() => new Set(),
		[trigger("one"), trigger("two")],
	);
	dispose();
	assert.deepEqual(order, ["register:one", "register:two", "dispose:two", "dispose:one"]);
});

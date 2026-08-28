import assert from "node:assert/strict";
import test from "node:test";
import { parseProtocolEvent } from "./protocol.ts";

test("accepts versioned upsert and remove events", () => {
	assert.deepEqual(
		parseProtocolEvent({ version: 1, action: "upsert", source: "ext:deploy", id: "job", status: "working" }),
		{ version: 1, action: "upsert", source: "ext:deploy", id: "job", status: "working" },
	);
	assert.deepEqual(
		parseProtocolEvent({ version: 1, action: "upsert", source: "ext:deploy", id: "job", status: "idle" }),
		{ version: 1, action: "upsert", source: "ext:deploy", id: "job", status: "idle" },
	);
	assert.deepEqual(parseProtocolEvent({ version: 1, action: "remove", source: "ext:deploy", id: "job" }), {
		version: 1,
		action: "remove",
		source: "ext:deploy",
		id: "job",
	});
});

test("rejects malformed protocol events", () => {
	assert.equal(parseProtocolEvent({ version: 2, action: "remove", source: "x", id: "y" }), undefined);
	assert.equal(parseProtocolEvent({ version: 1, action: "upsert", source: "x", id: "y", status: "unknown" }), undefined);
	assert.equal(parseProtocolEvent({ version: 1, action: "remove", source: "", id: "y" }), undefined);
	assert.equal(parseProtocolEvent({ version: 1, action: "remove", source: "pi", id: "main" }), undefined);
	assert.equal(parseProtocolEvent({ version: 1, action: "remove", source: `ext:${"x".repeat(129)}`, id: "y" }), undefined);
});

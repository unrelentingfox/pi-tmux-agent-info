import assert from "node:assert/strict";
import test from "node:test";
import { StatusContributionStore } from "./status.ts";

test("resolves contributions by semantic priority", () => {
	const changes: Array<string | undefined> = [];
	const store = new StatusContributionStore((status) => changes.push(status));

	store.upsert({ source: "pi", id: "idle", status: "idle" });
	store.upsert({ source: "pi", id: "main", status: "working" });
	store.upsert({ source: "ask", id: "one", status: "waiting" });
	store.upsert({ source: "subagent", id: "child", status: "attention" });
	store.remove("subagent", "child");

	assert.deepEqual(changes, ["idle", "working", "waiting", "attention", "waiting"]);
});

test("returns to idle when active work is removed", () => {
	const store = new StatusContributionStore();
	store.upsert({ source: "pi", id: "idle", status: "idle" });
	store.upsert({ source: "pi", id: "main", status: "working" });
	store.remove("pi", "main");

	assert.equal(store.resolve(), "idle");
});

test("keeps concurrent contributions independent", () => {
	const store = new StatusContributionStore();
	store.upsert({ source: "permission", id: "one", status: "waiting" });
	store.upsert({ source: "permission", id: "two", status: "waiting" });
	store.remove("permission", "one");

	assert.equal(store.resolve(), "waiting");
	store.remove("permission", "two");
	assert.equal(store.resolve(), undefined);
});

test("clears one source without affecting another", () => {
	const store = new StatusContributionStore();
	store.upsert({ source: "first", id: "same", status: "failed" });
	store.upsert({ source: "second", id: "same", status: "working" });
	store.clearSource("first");
	assert.equal(store.resolve(), "working");
});

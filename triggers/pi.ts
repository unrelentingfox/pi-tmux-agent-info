import type { StatusTrigger } from "./types.ts";

const SOURCE = "pi";
const RUN_ID = "main";
const TERMINAL_ID = "terminal";
const COMPACTION_ID = "compaction";
const IDLE_ID = "idle";

type StopReason = "error" | "aborted" | undefined;

export const piTrigger: StatusTrigger = {
	source: SOURCE,
	register(pi, contributions) {
		let active = true;
		let stopReason: StopReason;
		contributions.upsert(SOURCE, IDLE_ID, "idle");

		pi.on("agent_start", () => {
			if (!active) return;
			stopReason = undefined;
			contributions.clearStatuses(["done", "failed"]);
			contributions.upsert(SOURCE, RUN_ID, "working");
		});
		pi.on("message_end", (event) => {
			if (!active || event.message.role !== "assistant") return;
			const reason = event.message.stopReason;
			stopReason = reason === "error" || reason === "aborted" ? reason : undefined;
		});
		pi.on("session_before_compact", () => {
			if (active) contributions.upsert(SOURCE, COMPACTION_ID, "working");
		});
		pi.on("session_compact", () => {
			if (active) contributions.remove(SOURCE, COMPACTION_ID);
		});
		pi.on("session_compact_failed", () => {
			if (active) contributions.remove(SOURCE, COMPACTION_ID);
		});
		pi.on("agent_settled", () => {
			if (!active) return;
			contributions.remove(SOURCE, RUN_ID);
			if (stopReason === "error") contributions.upsert(SOURCE, TERMINAL_ID, "failed");
			else if (stopReason !== "aborted") contributions.upsert(SOURCE, TERMINAL_ID, "done");
		});

		return () => {
			active = false;
			contributions.clearSource(SOURCE);
		};
	},
};

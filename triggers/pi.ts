import type { StatusTrigger } from "./types.ts";

const SOURCE = "pi";
const RUN_ID = "main";
const TERMINAL_ID = "terminal";
const COMPACTION_ID = "compaction";
const IDLE_ID = "idle";
const PROMPT_ID = "prompt";
const TOOL_PREFIX = "tool:";

type StopReason = "error" | "aborted" | undefined;
type WaitingTools = () => ReadonlySet<string>;

interface ToolEvent {
	toolName: string;
	toolCallId: string;
}

export function createPiTrigger(waitingTools: WaitingTools = () => new Set()): StatusTrigger {
	return {
		source: SOURCE,
		register(pi, contributions) {
			let active = true;
			let stopReason: StopReason;
			const activeToolIds = new Set<string>();
			contributions.upsert(SOURCE, IDLE_ID, "idle");

			pi.on("agent_start", () => {
				if (!active) return;
				stopReason = undefined;
				contributions.upsert(SOURCE, RUN_ID, "working");
				contributions.remove(SOURCE, TERMINAL_ID);
				clearToolWaits(activeToolIds, contributions);
			});
			pi.on("message_end", (event) => {
				if (!active || event.message.role !== "assistant") return;
				const reason = event.message.stopReason;
				stopReason = reason === "error" || reason === "aborted" ? reason : undefined;
			});
			pi.on("tool_execution_start", (event) => {
				if (active && waitingTools().has(event.toolName)) {
					beginToolWait(event, activeToolIds, contributions);
				}
			});
			pi.on("tool_execution_end", (event) => {
				if (active) endToolWait(event, activeToolIds, contributions);
			});
			pi.on("ui_prompt_start", () => {
				if (active) contributions.upsert(SOURCE, PROMPT_ID, "waiting");
			});
			pi.on("ui_prompt_end", () => {
				if (active) contributions.remove(SOURCE, PROMPT_ID);
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
				if (stopReason === "error") contributions.upsert(SOURCE, TERMINAL_ID, "failed");
				else if (stopReason !== "aborted") contributions.upsert(SOURCE, TERMINAL_ID, "done");
				contributions.remove(SOURCE, RUN_ID);
			});

			return () => {
				active = false;
				contributions.clearSource(SOURCE);
			};
		},
	};
}

function beginToolWait(
	event: ToolEvent,
	activeToolIds: Set<string>,
	contributions: Parameters<StatusTrigger["register"]>[1],
): void {
	const id = toolId(event.toolCallId);
	activeToolIds.add(id);
	contributions.upsert(SOURCE, id, "waiting");
}

function endToolWait(
	event: ToolEvent,
	activeToolIds: Set<string>,
	contributions: Parameters<StatusTrigger["register"]>[1],
): void {
	const id = toolId(event.toolCallId);
	activeToolIds.delete(id);
	contributions.remove(SOURCE, id);
}

function clearToolWaits(
	activeToolIds: Set<string>,
	contributions: Parameters<StatusTrigger["register"]>[1],
): void {
	for (const id of activeToolIds) contributions.remove(SOURCE, id);
	activeToolIds.clear();
}

function toolId(toolCallId: string): string {
	return `${TOOL_PREFIX}${toolCallId}`;
}

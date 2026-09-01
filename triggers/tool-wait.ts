import type { StatusContributions, StatusTrigger } from "./types.ts";

interface ToolEvent {
	toolName: string;
	toolCallId: string;
}

export function createToolWaitingTrigger(source: string, toolName: string): StatusTrigger {
	return {
		source,
		register(pi, contributions) {
			let active = true;
			pi.on("tool_execution_start", (event) => {
				if (active) updateWaitingStatus(event, contributions, source, toolName, "upsert");
			});
			pi.on("tool_execution_end", (event) => {
				if (active) updateWaitingStatus(event, contributions, source, toolName, "remove");
			});
			return () => {
				active = false;
				contributions.clearSource(source);
			};
		},
	};
}

function updateWaitingStatus(
	event: ToolEvent,
	contributions: StatusContributions,
	source: string,
	toolName: string,
	action: "upsert" | "remove",
): void {
	if (event.toolName !== toolName) return;
	if (action === "upsert") contributions.upsert(source, event.toolCallId, "waiting");
	else contributions.remove(source, event.toolCallId);
}

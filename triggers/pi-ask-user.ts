import type { StatusContributions, StatusTrigger } from "./types.ts";

const SOURCE = "pi-ask-user";

interface ToolEvent {
	toolName: string;
	toolCallId: string;
}

export const piAskUserTrigger: StatusTrigger = {
	source: SOURCE,
	register(pi, contributions) {
		let active = true;
		pi.on("tool_execution_start", (event) => {
			if (active) beginAsk(event, contributions);
		});
		pi.on("tool_execution_end", (event) => {
			if (active) endAsk(event, contributions);
		});
		return () => {
			active = false;
			contributions.clearSource(SOURCE);
		};
	},
};

function beginAsk(event: ToolEvent, contributions: StatusContributions): void {
	if (event.toolName === "ask_user") contributions.upsert(SOURCE, event.toolCallId, "waiting");
}

function endAsk(event: ToolEvent, contributions: StatusContributions): void {
	if (event.toolName === "ask_user") contributions.remove(SOURCE, event.toolCallId);
}

import type { StatusContributions, StatusTrigger } from "./types.ts";

const SOURCE = "pi-hermes-memory-tools";
const FAILURE_PREFIX = "failure:";
const HERMES_TOOLS = new Set([
	"memory_add",
	"memory_replace",
	"memory_remove",
	"memory_search",
	"session_search",
	"skill_manage",
]);

interface HermesToolEvent {
	toolName: string;
	toolCallId: string;
	isError?: boolean;
}

export const piHermesMemoryTrigger: StatusTrigger = {
	source: SOURCE,
	register(pi, contributions) {
		let active = true;
		const failureIds = new Set<string>();
		pi.on("tool_execution_start", (event) => {
			if (active) beginHermesTool(event, contributions, failureIds);
		});
		pi.on("tool_execution_end", (event) => {
			if (active) endHermesTool(event, contributions, failureIds);
		});
		return () => {
			active = false;
			contributions.clearSource(SOURCE);
		};
	},
};

function beginHermesTool(
	event: HermesToolEvent,
	contributions: StatusContributions,
	failureIds: Set<string>,
): void {
	if (!isHermesTool(event)) return;
	for (const id of failureIds) contributions.remove(SOURCE, id);
	failureIds.clear();
	contributions.upsert(SOURCE, event.toolCallId, "working");
}

function endHermesTool(
	event: HermesToolEvent,
	contributions: StatusContributions,
	failureIds: Set<string>,
): void {
	if (!isHermesTool(event)) return;
	contributions.remove(SOURCE, event.toolCallId);
	if (!event.isError) return;
	const failureId = `${FAILURE_PREFIX}${event.toolCallId}`;
	failureIds.add(failureId);
	contributions.upsert(SOURCE, failureId, "failed");
}

function isHermesTool(event: HermesToolEvent): boolean {
	return HERMES_TOOLS.has(event.toolName) && event.toolCallId.length > 0;
}

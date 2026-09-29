import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createPiTrigger } from "./pi.ts";
import { piSubagentsTrigger } from "./pi-subagents.ts";
import { protocolTrigger } from "./protocol.ts";
import type { StatusContributions, StatusTrigger } from "./types.ts";

export function registerStatusTriggers(
	pi: ExtensionAPI,
	contributions: StatusContributions,
	context: ExtensionContext,
	waitingTools: () => ReadonlySet<string> = () => new Set(),
	triggers: readonly StatusTrigger[] = [createPiTrigger(waitingTools), piSubagentsTrigger, protocolTrigger],
): () => void {
	const disposers = triggers.map((trigger) => trigger.register(pi, contributions, context));
	return () => {
		for (const dispose of disposers.reverse()) dispose();
	};
}

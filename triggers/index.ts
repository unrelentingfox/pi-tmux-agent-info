import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiTrigger } from "./pi.ts";
import { protocolTrigger } from "./protocol.ts";
import type { StatusContributions, StatusTrigger } from "./types.ts";

export function registerStatusTriggers(
	pi: ExtensionAPI,
	contributions: StatusContributions,
	waitingTools: () => ReadonlySet<string> = () => new Set(),
	triggers: readonly StatusTrigger[] = [createPiTrigger(waitingTools), protocolTrigger],
): () => void {
	const disposers = triggers.map((trigger) => trigger.register(pi, contributions));
	return () => {
		for (const dispose of disposers.reverse()) dispose();
	};
}

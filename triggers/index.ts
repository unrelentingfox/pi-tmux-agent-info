import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { piAskUserTrigger } from "./pi-ask-user.ts";
import { piHermesMemoryTrigger } from "./pi-hermes-memory.ts";
import { piPermissionSystemTrigger } from "./pi-permission-system.ts";
import { piPlannotatorTrigger } from "./pi-plannotator.ts";
import { piTrigger } from "./pi.ts";
import { protocolTrigger } from "./protocol.ts";
import type { StatusContributions, StatusTrigger } from "./types.ts";

export const STATUS_TRIGGERS: readonly StatusTrigger[] = [
	piTrigger,
	piPermissionSystemTrigger,
	piAskUserTrigger,
	piPlannotatorTrigger,
	piHermesMemoryTrigger,
	protocolTrigger,
];

export function registerStatusTriggers(
	pi: ExtensionAPI,
	contributions: StatusContributions,
	triggers: readonly StatusTrigger[] = STATUS_TRIGGERS,
): () => void {
	const disposers = triggers.map((trigger) => trigger.register(pi, contributions));
	return () => {
		for (const dispose of disposers.reverse()) dispose();
	};
}

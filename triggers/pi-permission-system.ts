import type { StatusTrigger } from "./types.ts";
import { isRecord, subscribe } from "./types.ts";

const SOURCE = "pi-permission-system";

export const piPermissionSystemTrigger: StatusTrigger = {
	source: SOURCE,
	register(pi, contributions) {
		const disposers = [
			subscribe(pi, "permissions:ui_prompt", (payload) => {
				const requestId = requestIdFrom(payload);
				if (requestId) contributions.upsert(SOURCE, requestId, "waiting");
			}),
			subscribe(pi, "permissions:decision", (payload) => {
				const requestId = requestIdFrom(payload);
				if (requestId) contributions.remove(SOURCE, requestId);
			}),
		];
		return () => {
			for (const dispose of disposers) dispose();
			contributions.clearSource(SOURCE);
		};
	},
};

function requestIdFrom(payload: unknown): string | undefined {
	if (!isRecord(payload)) return undefined;
	return typeof payload.requestId === "string" && payload.requestId ? payload.requestId : undefined;
}

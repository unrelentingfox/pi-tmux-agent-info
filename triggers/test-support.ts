import type { AgentStatus } from "../status.ts";
import type { StatusContributions } from "./types.ts";

export interface ContributionCall {
	action: "upsert" | "remove" | "clearSource" | "clearStatuses";
	source?: string;
	id?: string;
	status?: AgentStatus;
	statuses?: readonly AgentStatus[];
}

export function contributionSpy(): { contributions: StatusContributions; calls: ContributionCall[] } {
	const calls: ContributionCall[] = [];
	return {
		calls,
		contributions: {
			upsert: (source, id, status) => calls.push({ action: "upsert", source, id, status }),
			remove: (source, id) => calls.push({ action: "remove", source, id }),
			clearSource: (source) => calls.push({ action: "clearSource", source }),
			clearStatuses: (statuses) => calls.push({ action: "clearStatuses", statuses }),
		},
	};
}

export function eventHandlers(): {
	on(event: string, handler: (value: any) => void): void;
	emit(event: string, value: any): void;
	count(event: string): number;
} {
	const handlers = new Map<string, Set<(value: any) => void>>();
	return {
		on(event, handler) {
			const subscribers = handlers.get(event) ?? new Set();
			subscribers.add(handler);
			handlers.set(event, subscribers);
		},
		emit(event, value) {
			for (const handler of handlers.get(event) ?? []) handler(value);
		},
		count(event) {
			return handlers.get(event)?.size ?? 0;
		},
	};
}

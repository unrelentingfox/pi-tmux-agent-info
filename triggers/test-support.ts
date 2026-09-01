import type { AgentStatus } from "../status.ts";
import type { StatusContributions } from "./types.ts";

export interface ContributionCall {
	action: "upsert" | "remove" | "clearSource";
	source?: string;
	id?: string;
	status?: AgentStatus;
}

export function contributionSpy(): { contributions: StatusContributions; calls: ContributionCall[] } {
	const calls: ContributionCall[] = [];
	return {
		calls,
		contributions: {
			upsert: (source, id, status) => calls.push({ action: "upsert", source, id, status }),
			remove: (source, id) => calls.push({ action: "remove", source, id }),
			clearSource: (source) => calls.push({ action: "clearSource", source }),
		},
	};
}

export function eventHandlers(): {
	on(event: string, handler: (value: any) => void): void;
	emit(event: string, value: any): void;
	count(event: string): number;
	totalCount(): number;
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
		totalCount() {
			return [...handlers.values()].reduce((total, subscribers) => total + subscribers.size, 0);
		},
	};
}

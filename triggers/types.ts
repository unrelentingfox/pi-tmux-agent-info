import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentStatus } from "../status.ts";

export interface StatusContributions {
	upsert(source: string, id: string, status: AgentStatus): void;
	remove(source: string, id: string): void;
	clearSource(source: string): void;
	clearStatuses(statuses: readonly AgentStatus[]): void;
}

export interface StatusTrigger {
	source: string;
	register(pi: ExtensionAPI, contributions: StatusContributions): () => void;
}

export interface EventBus {
	on(channel: string, handler: (payload: unknown) => void): (() => void) | void;
}

export function subscribe(
	pi: ExtensionAPI,
	channel: string,
	handler: (payload: unknown) => void,
): () => void {
	return pi.events.on(channel, handler) ?? (() => undefined);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

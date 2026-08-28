import { isAgentStatus } from "../status.ts";
import type { AgentStatus } from "../status.ts";
import type { StatusTrigger } from "./types.ts";
import { isRecord, subscribe } from "./types.ts";

export const TMUX_AGENT_STATUS_EVENT = "tmux-agent-status:v1";
const MAX_KEY_LENGTH = 128;
const EXTERNAL_SOURCE_PREFIX = "ext:";

type StatusProtocolEvent =
	| { version: 1; action: "upsert"; source: string; id: string; status: AgentStatus }
	| { version: 1; action: "remove"; source: string; id: string };

export const protocolTrigger: StatusTrigger = {
	source: TMUX_AGENT_STATUS_EVENT,
	register(pi, contributions) {
		const seenSources = new Set<string>();
		const dispose = subscribe(pi, TMUX_AGENT_STATUS_EVENT, (payload) => {
			const event = parseProtocolEvent(payload);
			if (!event) return;
			seenSources.add(event.source);
			if (event.action === "upsert") contributions.upsert(event.source, event.id, event.status);
			else contributions.remove(event.source, event.id);
		});
		return () => {
			dispose();
			for (const source of seenSources) contributions.clearSource(source);
		};
	},
};

export function parseProtocolEvent(payload: unknown): StatusProtocolEvent | undefined {
	if (!isRecord(payload) || payload.version !== 1) return undefined;
	if (!validSource(payload.source) || !validKey(payload.id)) return undefined;
	if (payload.action === "remove") return payload as StatusProtocolEvent;
	if (payload.action !== "upsert" || !isAgentStatus(payload.status)) return undefined;
	return payload as StatusProtocolEvent;
}

function validKey(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= MAX_KEY_LENGTH;
}

function validSource(value: unknown): value is string {
	return validKey(value) && value.startsWith(EXTERNAL_SOURCE_PREFIX) && value.length > EXTERNAL_SOURCE_PREFIX.length;
}

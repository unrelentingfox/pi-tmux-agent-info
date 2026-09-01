export const AGENT_STATUSES = ["attention", "waiting", "failed", "working", "done", "idle"] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

export interface StatusContribution {
	source: string;
	id: string;
	status: AgentStatus;
}

const STATUS_PRIORITY: Record<AgentStatus, number> = {
	attention: 5,
	waiting: 4,
	failed: 3,
	working: 2,
	done: 1,
	idle: 0,
};

export class StatusContributionStore {
	readonly #contributions = new Map<string, StatusContribution>();
	readonly #onChange: (status: AgentStatus | undefined) => void;
	#resolved: AgentStatus | undefined;

	constructor(onChange: (status: AgentStatus | undefined) => void = () => undefined) {
		this.#onChange = onChange;
	}

	upsert(contribution: StatusContribution): void {
		this.#contributions.set(contributionKey(contribution.source, contribution.id), contribution);
		this.#notifyIfChanged();
	}

	remove(source: string, id: string): void {
		this.#contributions.delete(contributionKey(source, id));
		this.#notifyIfChanged();
	}

	clearSource(source: string): void {
		for (const [key, contribution] of this.#contributions) {
			if (contribution.source === source) this.#contributions.delete(key);
		}
		this.#notifyIfChanged();
	}

	clear(): void {
		this.#contributions.clear();
		this.#notifyIfChanged();
	}

	resolve(): AgentStatus | undefined {
		let resolved: AgentStatus | undefined;
		for (const { status } of this.#contributions.values()) {
			if (!resolved || STATUS_PRIORITY[status] > STATUS_PRIORITY[resolved]) resolved = status;
		}
		return resolved;
	}

	#notifyIfChanged(): void {
		const resolved = this.resolve();
		if (resolved === this.#resolved) return;
		this.#resolved = resolved;
		this.#onChange(resolved);
	}
}

export function isAgentStatus(value: unknown): value is AgentStatus {
	return typeof value === "string" && (AGENT_STATUSES as readonly string[]).includes(value);
}

function contributionKey(source: string, id: string): string {
	return `${source}\0${id}`;
}

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StatusContributionStore, type AgentStatus } from "./status.ts";
import { registerStatusTriggers } from "./triggers/index.ts";
import type { StatusContributions } from "./triggers/types.ts";

const tmuxPane = process.env.TMUX_PANE;
const HARNESS = "pi";

export default function piTmuxAgentInfo(pi: ExtensionAPI): void {
	if (process.env.PI_SUBAGENT_CHILD === "1") return;

	let currentStatus: AgentStatus | undefined;
	let pendingSync = Promise.resolve();
	const queueSync = (commands: string[][]): Promise<void> => {
		pendingSync = pendingSync.then(() => runTmuxCommands(pi, commands));
		return pendingSync;
	};
	const store = new StatusContributionStore((status) => {
		currentStatus = status;
		void queueSync(statusOptionCommands(tmuxPane, status));
	});
	const contributions: StatusContributions = {
		upsert: (source, id, status) => store.upsert({ source, id, status }),
		remove: (source, id) => store.remove(source, id),
		clearSource: (source) => store.clearSource(source),
		clearStatuses: (statuses) => store.clearStatuses(statuses),
	};
	const disposeTriggers = registerStatusTriggers(pi, contributions);

	pi.on("session_start", async () => {
		await queueSync(agentInfoCommands(tmuxPane, HARNESS, pi.getSessionName(), currentStatus));
	});

	pi.on("session_info_changed", async (event) => {
		await queueSync(agentInfoCommands(tmuxPane, HARNESS, event.name, currentStatus));
	});

	pi.on("session_shutdown", async () => {
		disposeTriggers();
		store.clear();
		await queueSync(clearAgentInfoCommands(tmuxPane));
	});
}

async function runTmuxCommands(pi: ExtensionAPI, commands: string[][]): Promise<void> {
	try {
		for (const args of commands) await pi.exec("tmux", args);
	} catch {
		// The host pane can close before Pi shuts down.
	}
}

export function agentInfoCommands(
	pane: string | undefined,
	harness: string,
	sessionName: string | undefined,
	status: AgentStatus | undefined,
): string[][] {
	if (!pane) return [];
	return [
		setPaneOption(pane, "@agent_harness", harness),
		setOrUnsetPaneOption(pane, "@agent_session_name", sessionName),
		setOrUnsetPaneOption(pane, "@agent_status", status),
	];
}

export function statusOptionCommands(pane: string | undefined, status: AgentStatus | undefined): string[][] {
	return pane ? [setOrUnsetPaneOption(pane, "@agent_status", status)] : [];
}

export function clearAgentInfoCommands(pane: string | undefined): string[][] {
	if (!pane) return [];
	return ["@agent_harness", "@agent_session_name", "@agent_status"].map((option) => unsetPaneOption(pane, option));
}

function setOrUnsetPaneOption(pane: string, option: string, value: string | undefined): string[] {
	return value ? setPaneOption(pane, option, value) : unsetPaneOption(pane, option);
}

function setPaneOption(pane: string, option: string, value: string): string[] {
	return ["set-option", "-p", "-t", pane, option, value];
}

function unsetPaneOption(pane: string, option: string): string[] {
	return ["set-option", "-p", "-u", "-t", pane, option];
}

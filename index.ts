import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadTmuxAgentInfoConfig } from "./config.ts";
import { StatusContributionStore, type AgentStatus } from "./status.ts";
import { registerStatusTriggers } from "./triggers/index.ts";
import type { StatusContributions } from "./triggers/types.ts";

const HARNESS = "pi";
const OWNER_KEY = Symbol.for("pi-tmux-agent-info:owner");
const extensionOwners = globalThis as typeof globalThis & { [key: symbol]: unknown };

export default function piTmuxAgentInfo(
	pi: ExtensionAPI,
	loadConfig = loadTmuxAgentInfoConfig,
): void {
	if (process.env.PI_SUBAGENT_CHILD === "1") return;

	const tmuxPane = process.env.TMUX_PANE;
	const owner = Symbol();
	let currentStatus: AgentStatus | undefined;
	let sessionMode: ExtensionContext["mode"] | undefined;
	let publishing = false;
	let waitingTools: ReadonlySet<string> = new Set();
	let disposeTriggers: (() => void) | undefined;
	let pendingSync = Promise.resolve();
	let sessionId: string | undefined;
	let backgroundRuns: ReturnType<typeof setInterval> | undefined;
	const isAuthorizedStatusPublisher = (): boolean =>
		publishing &&
		isInteractiveParentSession(sessionMode) &&
		extensionOwners[OWNER_KEY] === owner;
	const queueSync = (commands: string[][]): Promise<void> => {
		pendingSync = pendingSync.then(() =>
			isAuthorizedStatusPublisher() ? runTmuxCommands(pi, commands) : undefined,
		);
		return pendingSync;
	};
	const publishSnapshot = () => {
		if (!isAuthorizedStatusPublisher()) return Promise.resolve();
		return queueSync(agentInfoCommands(tmuxPane, HARNESS, pi.getSessionName(), currentStatus));
	};
	const store = new StatusContributionStore((status) => {
		if (!isAuthorizedStatusPublisher()) return;
		currentStatus = status;
		void publishSnapshot();
	});
	const contributions: StatusContributions = {
		upsert: (source, id, status) => {
			if (isAuthorizedStatusPublisher()) store.upsert({ source, id, status });
		},
		remove: (source, id) => {
			if (isAuthorizedStatusPublisher()) store.remove(source, id);
		},
		clearSource: (source) => {
			if (isAuthorizedStatusPublisher()) store.clearSource(source);
		},
	};

	pi.on("session_start", async (_event, ctx) => {
		sessionMode = ctx.mode;
		if (!isInteractiveParentSession(sessionMode)) return;
		extensionOwners[OWNER_KEY] = owner;
		publishing = true;
		sessionId = ctx.sessionManager.getSessionFile() ?? ctx.sessionManager.getSessionId();
		disposeTriggers ??= registerStatusTriggers(pi, contributions, () => waitingTools);
		const config = loadConfig();
		waitingTools = config.waitingTools;
		for (const warning of config.warnings) ctx.ui.notify(`tmux-agent-info: ${warning}`, "warning");
		await syncBackgroundRuns();
		backgroundRuns ??= setInterval(() => void syncBackgroundRuns(), 1000);
		backgroundRuns.unref();
		await publishSnapshot();
	});

	pi.on("session_info_changed", async () => {
		if (isAuthorizedStatusPublisher()) await publishSnapshot();
	});

	pi.on("session_shutdown", async (event) => {
		const clearPane = event.reason === "quit" && isAuthorizedStatusPublisher();
		publishing = false;
		if (backgroundRuns) clearInterval(backgroundRuns);
		backgroundRuns = undefined;
		sessionId = undefined;
		disposeTriggers?.();
		disposeTriggers = undefined;
		store.clear();
		await pendingSync;
		if (clearPane) {
			await runTmuxCommands(pi, clearAgentInfoCommands(tmuxPane));
			delete extensionOwners[OWNER_KEY];
		}
	});

	async function syncBackgroundRuns(): Promise<void> {
		if (!isAuthorizedStatusPublisher() || !sessionId) return;
		const activeRuns = listOwnedActiveRuns(sessionId);
		if (activeRuns.length > 0) {
			contributions.upsert("ext:pi-subagents", "background-runs", "working");
		} else {
			contributions.remove("ext:pi-subagents", "background-runs");
		}
	}
}

export function listOwnedActiveRuns(sessionId: string): string[] {
	const configuredRoot = process.env.PI_SUBAGENTS_TEMP_ROOT?.trim();
	const tempRoot = configuredRoot
		? resolve(configuredRoot)
		: join(tmpdir(), `pi-subagents-${resolveTempScopeId()}`);
	const asyncRoot = join(tempRoot, "async-subagent-runs");
	let activeRunIds: string[];
	try {
		activeRunIds = readdirSync(join(asyncRoot, ".active-runs"));
	} catch {
		return [];
	}
	return activeRunIds.filter((runId) => isOwnedActiveRun(asyncRoot, runId, sessionId));
}

function isOwnedActiveRun(asyncRoot: string, runId: string, sessionId: string): boolean {
	const runDir = join(asyncRoot, runId);
	try {
		if (!existsSync(runDir)) return false;
		const status = JSON.parse(readFileSync(join(runDir, "status.json"), "utf8"));
		return status.sessionId === sessionId && (status.state === "queued" || status.state === "running");
	} catch {
		return false;
	}
}

function resolveTempScopeId(): string {
	const uid = process.getuid?.();
	if (uid !== undefined) return `uid-${uid}`;
	const user = process.env.USERNAME ?? process.env.USER ?? process.env.LOGNAME;
	if (user) return `user-${sanitizeScopeId(user.trim())}`;
	const home = process.env.USERPROFILE ?? process.env.HOME ?? "unknown";
	return `home-${sanitizeScopeId(home)}`;
}

function sanitizeScopeId(value: string): string {
	return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

export function isInteractiveParentSession(mode: ExtensionContext["mode"] | undefined): boolean {
	return mode === "tui" && process.env.PI_SUBAGENT_CHILD !== "1";
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

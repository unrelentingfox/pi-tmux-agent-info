import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { StatusTrigger } from "./types.ts";

const SOURCE = "ext:pi-subagents";
const BACKGROUND_RUNS_ID = "background-runs";
const POLL_INTERVAL_MS = 1000;

export const piSubagentsTrigger: StatusTrigger = {
	source: SOURCE,
	register(pi, contributions) {
		let active = true;
		let sessionId: string | undefined;
		let polling: ReturnType<typeof setInterval> | undefined;
		let syncInProgress = false;

		const syncBackgroundRuns = () => {
			if (!active || !sessionId || syncInProgress) return;
			syncInProgress = true;
			try {
				if (listOwnedActiveRuns(sessionId).length > 0) {
					contributions.upsert(SOURCE, BACKGROUND_RUNS_ID, "working");
				} else {
					contributions.remove(SOURCE, BACKGROUND_RUNS_ID);
				}
			} finally {
				syncInProgress = false;
			}
		};

		pi.on("session_start", (_event, context) => {
			sessionId = context.sessionManager.getSessionFile() ?? context.sessionManager.getSessionId();
			syncBackgroundRuns();
			polling ??= setInterval(syncBackgroundRuns, POLL_INTERVAL_MS);
			polling.unref();
		});

		pi.on("session_shutdown", () => {
			if (polling) clearInterval(polling);
			polling = undefined;
			sessionId = undefined;
			contributions.remove(SOURCE, BACKGROUND_RUNS_ID);
		});

		return () => {
			active = false;
			if (polling) clearInterval(polling);
			contributions.clearSource(SOURCE);
		};
	},
};

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

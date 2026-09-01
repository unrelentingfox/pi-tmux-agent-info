import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface TmuxAgentInfoConfig {
	waitingTools: ReadonlySet<string>;
	warnings: string[];
}

type ReadConfig = (path: string) => string;

export function loadTmuxAgentInfoConfig(
	path = join(homedir(), ".pi", "agent", "tmux-agent-info.json"),
	readConfig: ReadConfig = (configPath) => readFileSync(configPath, "utf8"),
): TmuxAgentInfoConfig {
	let contents: string;
	try {
		contents = readConfig(path);
	} catch (error) {
		if (isMissingFile(error)) return emptyConfig();
		return emptyConfig(`Cannot read ${path}: ${describeError(error)}`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(contents);
	} catch (error) {
		return emptyConfig(`Cannot parse ${path}: ${describeError(error)}`);
	}

	return parseConfig(parsed, path);
}

function parseConfig(value: unknown, path: string): TmuxAgentInfoConfig {
	if (!isRecord(value)) return emptyConfig(`${path} must contain a JSON object.`);
	if (!("waitingTools" in value)) return emptyConfig();
	if (!Array.isArray(value.waitingTools)) {
		return emptyConfig(`${path}: waitingTools must be an array of tool names.`);
	}

	const waitingTools = new Set<string>();
	let invalid = false;
	let duplicate = false;
	for (const entry of value.waitingTools) {
		if (typeof entry !== "string" || !entry.trim()) {
			invalid = true;
			continue;
		}
		const toolName = entry.trim();
		if (waitingTools.has(toolName)) duplicate = true;
		waitingTools.add(toolName);
	}

	const warnings: string[] = [];
	if (invalid) warnings.push(`${path}: ignored invalid waitingTools entries.`);
	if (duplicate) warnings.push(`${path}: removed duplicate waitingTools entries.`);
	return { waitingTools, warnings };
}

function emptyConfig(warning?: string): TmuxAgentInfoConfig {
	return { waitingTools: new Set(), warnings: warning ? [warning] : [] };
}

function isMissingFile(error: unknown): boolean {
	return isRecord(error) && error.code === "ENOENT";
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

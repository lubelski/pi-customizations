import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Adapted from @moguw/pi-session-rename under the MIT license.

export const THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

export type ThinkingLevelValue = (typeof THINKING_LEVELS)[number];
export type ActiveThinkingLevel = Exclude<ThinkingLevelValue, "off">;

export type RenameConfig = {
	afterSteps: number;
	everySteps: number;
	model: string;
	thinkingLevel: ThinkingLevelValue;
};

export const DEFAULT_RENAME_MODEL = "openai-codex/gpt-5.6-luna";

export const DEFAULT_RENAME_CONFIG: RenameConfig = {
	afterSteps: 1,
	everySteps: 5,
	model: DEFAULT_RENAME_MODEL,
	thinkingLevel: "low",
};

type BranchEntryLike = {
	type: string;
	message?: {
		role?: string;
		content?: unknown;
	};
};

function nonNegativeInteger(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
	return Math.floor(value);
}

export function parseRenameConfig(
	parsed: Record<string, unknown>,
): { value: RenameConfig; warnings: string[] } {
	const value: RenameConfig = { ...DEFAULT_RENAME_CONFIG };
	const warnings: string[] = [];

	if (parsed.afterSteps !== undefined) {
		const afterSteps = nonNegativeInteger(parsed.afterSteps);
		if (afterSteps === undefined) {
			warnings.push(`Ignored invalid afterSteps: ${JSON.stringify(parsed.afterSteps)}`);
		} else {
			value.afterSteps = afterSteps;
		}
	}

	if (parsed.everySteps !== undefined) {
		const everySteps = nonNegativeInteger(parsed.everySteps);
		if (everySteps === undefined) {
			warnings.push(`Ignored invalid everySteps: ${JSON.stringify(parsed.everySteps)}`);
		} else {
			value.everySteps = everySteps;
		}
	}

	if (parsed.model !== undefined) {
		if (typeof parsed.model === "string") {
			value.model = parsed.model.trim();
		} else {
			warnings.push(`Ignored invalid model: ${JSON.stringify(parsed.model)}`);
		}
	}

	if (parsed.thinkingLevel !== undefined) {
		const thinkingLevel = typeof parsed.thinkingLevel === "string"
			? parsed.thinkingLevel.trim()
			: "";
		if ((THINKING_LEVELS as readonly string[]).includes(thinkingLevel)) {
			value.thinkingLevel = thinkingLevel as ThinkingLevelValue;
		} else {
			warnings.push(`Ignored invalid thinkingLevel: ${JSON.stringify(parsed.thinkingLevel)}`);
		}
	}

	return { value, warnings };
}

export function loadRenameConfig(
	path: string,
): { value: RenameConfig; warnings: string[] } {
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {
				value: { ...DEFAULT_RENAME_CONFIG },
				warnings: ["Ignored invalid rename config: expected a JSON object"],
			};
		}
		return parseRenameConfig(parsed as Record<string, unknown>);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
			return { value: { ...DEFAULT_RENAME_CONFIG }, warnings: [] };
		}
		return {
			value: { ...DEFAULT_RENAME_CONFIG },
			warnings: [
				`Ignored unreadable rename config: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
}

export function saveRenameConfig(path: string, patch: Partial<RenameConfig>): void {
	const { value } = loadRenameConfig(path);
	const next = { ...value, ...patch };
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter(
			(block): block is { type: "text"; text: string } =>
				block !== null &&
				typeof block === "object" &&
				(block as { type?: unknown }).type === "text" &&
				typeof (block as { text?: unknown }).text === "string",
		)
		.map((block) => block.text)
		.join("\n");
}

const MAX_CONVERSATION_CHARS = 60_000;

export function buildConversationText(branch: readonly BranchEntryLike[]): string {
	const sections: string[] = [];
	for (const entry of branch) {
		if (entry.type !== "message" || entry.message?.role !== "user") continue;
		const text = messageText(entry.message.content).trim();
		if (text) sections.push(`User: ${text}`);
	}

	const conversation = sections.join("\n\n");
	if (conversation.length <= MAX_CONVERSATION_CHARS) return conversation;
	return `[Earlier conversation omitted]\n${conversation.slice(-MAX_CONVERSATION_CHARS)}`;
}

export function sanitizeName(text: string): string | undefined {
	const [firstLine = ""] = text.trim().split(/\r?\n/);
	const name = firstLine.replace(/\s+/g, " ").slice(0, 120).trim();
	return name || undefined;
}

const SESSION_NAME_TAG = /<session_name>([\s\S]*?)<\/session_name>/i;

export function extractSessionName(text: string): string | undefined {
	const match = SESSION_NAME_TAG.exec(text);
	const name = sanitizeName((match?.[1] ?? "").replace(/\s+/g, " "));
	if (!name) return undefined;
	return name.split(/\s+/).slice(0, 10).join(" ");
}

export function stripQuotes(text: string): string {
	const trimmed = text.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1).trim();
	}
	return trimmed;
}

export type RenameCommand =
	| { kind: "settings" }
	| { kind: "generate" }
	| { kind: "set-name"; name: string };

export function parseRenameCommand(args: string): RenameCommand {
	const trimmed = args.trim();
	if (!trimmed) return { kind: "generate" };
	if (trimmed === "settings") return { kind: "settings" };
	return { kind: "set-name", name: stripQuotes(trimmed) };
}

export function getRenameArgumentCompletions(
	prefix: string,
): Array<{ value: string; label: string; description: string }> | null {
	if (!"settings".startsWith(prefix)) return null;
	return [{ value: "settings", label: "settings", description: "Open session rename settings" }];
}

export function parseModelRef(ref: string): { provider: string; id: string } | null {
	const trimmed = ref.trim();
	const slash = trimmed.indexOf("/");
	if (slash <= 0 || slash === trimmed.length - 1) return null;
	return { provider: trimmed.slice(0, slash), id: trimmed.slice(slash + 1) };
}

export function resolveThinkingLevel(configured: string): ActiveThinkingLevel | undefined {
	const level = configured.trim();
	if (level === "off") return undefined;
	return (THINKING_LEVELS as readonly string[]).includes(level)
		? level as ActiveThinkingLevel
		: undefined;
}

export function isNamingDue(turns: number, afterSteps: number, everySteps: number): boolean {
	if (afterSteps <= 0 || turns < afterSteps) return false;
	if (turns === afterSteps) return true;
	return everySteps > 0 && (turns - afterSteps) % everySteps === 0;
}

export function shouldApplyAutoName(
	epoch: number,
	currentEpoch: number,
	currentName: string | undefined,
	autoOwned: boolean,
): boolean {
	return epoch === currentEpoch && (autoOwned || !currentName);
}

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
		toolName?: string;
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
const MAX_MESSAGE_CHARS = 8_000;

function truncateMessage(text: string): string {
	if (text.length <= MAX_MESSAGE_CHARS) return text;
	const omitted = "\n[Message middle omitted]\n";
	const tailLength = 2_000;
	return `${text.slice(0, MAX_MESSAGE_CHARS - tailLength - omitted.length)}${omitted}${text.slice(-tailLength)}`;
}

const LINK_PATTERN = /https?:\/\/\S+/i;
const TITLE_EVIDENCE_PATTERN = /(?:^|[\s"'<])(title|name)(?:[\s"'>]*[:=]|>)/im;

function conversationSection(
	entry: BranchEntryLike,
	includeLinkedItemEvidence: boolean,
): string | undefined {
	if (entry.type !== "message" || !entry.message) return undefined;
	const text = messageText(entry.message.content).trim();
	if (!text) return undefined;

	const content = truncateMessage(text);
	if (entry.message.role === "user") return `User: ${content}`;
	if (entry.message.role === "assistant" && includeLinkedItemEvidence) {
		return `Assistant: ${content}`;
	}
	if (
		entry.message.role === "toolResult" &&
		includeLinkedItemEvidence &&
		TITLE_EVIDENCE_PATTERN.test(text)
	) {
		const tool = entry.message.toolName ? ` (${entry.message.toolName})` : "";
		return `Retrieved tool context${tool}: ${content}`;
	}
	return undefined;
}

export function buildConversationText(branch: readonly BranchEntryLike[]): string {
	const initialUserText = branch
		.filter((entry) => entry.type === "message" && entry.message?.role === "user")
		.map((entry) => messageText(entry.message?.content).trim())
		.find(Boolean) ?? "";
	const includeLinkedItemEvidence = LINK_PATTERN.test(initialUserText);
	const sections = branch
		.map((entry) => conversationSection(entry, includeLinkedItemEvidence))
		.filter((section): section is string => section !== undefined);
	const conversation = sections.join("\n\n");
	if (conversation.length <= MAX_CONVERSATION_CHARS) return conversation;

	const first = sections[0] ?? "";
	const marker = "\n\n[Earlier conversation omitted]\n";
	const tailLength = MAX_CONVERSATION_CHARS - first.length - marker.length;
	return `${first}${marker}${conversation.slice(-tailLength)}`;
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

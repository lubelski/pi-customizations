import type { Model } from "@earendil-works/pi-ai";
import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import {
	DEFAULT_RENAME_MODEL,
	THINKING_LEVELS,
	buildConversationText,
	extractSessionName,
	getRenameArgumentCompletions,
	isNamingDue,
	loadRenameConfig,
	parseModelRef,
	parseRenameCommand,
	resolveThinkingLevel,
	saveRenameConfig,
	shouldApplyAutoName,
	type RenameConfig,
	type ThinkingLevelValue,
} from "../lib/pi-customizations/session-rename.ts";

// Adapted from @moguw/pi-session-rename under the MIT license.

const STATUS_KEY = "session-rename";
const NAMING_TIMEOUT_MS = 60_000;
const DEFAULT_MODEL_OPTION = `(default: ${DEFAULT_RENAME_MODEL})`;

const NAMING_SYSTEM_PROMPT = `You name coding-agent sessions.
Return only a concise topic that makes the session easy to identify in a list.
Name the user's primary intent or desired outcome, not incidental recent progress.
Use the same language as the user. Preserve useful file, package, command, model, and error names.
Use 2 to 10 words. Do not include a date, type code, project name, prefix, suffix, or parenthetical metadata.
Base the topic on evidence in the conversation; do not invent one.
Your final response must contain exactly one <session_name>...</session_name> tag and no other text.
Avoid generic names such as "Coding Session", "Project Work", or "General Questions".`;

const NAMING_OUTPUT_CONTRACT = `Return exactly one tag and nothing else:
<session_name>Concise topic</session_name>`;

function renameConfigPath(): string {
	return join(getAgentDir(), "rename.json");
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
}

function resolveNamingModel(
	ctx: ExtensionContext,
	modelRef: string,
): { model: Model<any> | undefined; note?: string } {
	const ref = modelRef.trim() || DEFAULT_RENAME_MODEL;
	const parsed = parseModelRef(ref);
	if (!parsed) return { model: undefined, note: `Invalid model ref: ${ref}` };
	const model = ctx.modelRegistry.find(parsed.provider, parsed.id);
	if (!model) return { model: undefined, note: `Model not found: ${ref}` };
	return { model };
}

async function generateSessionName(
	ctx: ExtensionContext,
	config: RenameConfig,
): Promise<string> {
	const conversation = buildConversationText(ctx.sessionManager.getBranch());
	if (!conversation.trim()) throw new Error("No conversation found to name");

	const { model, note } = resolveNamingModel(ctx, config.model);
	if (!model) throw new Error(note ?? "No model selected");
	if (!ctx.modelRegistry.hasConfiguredAuth(model)) {
		throw new Error(`No authentication configured for ${model.provider}/${model.id}`);
	}

	const reasoning = resolveThinkingLevel(config.thinkingLevel);
	const response = await ctx.modelRegistry.streamSimple(
		model,
		{
			systemPrompt: NAMING_SYSTEM_PROMPT,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Conversation:\n${conversation}\n\n${NAMING_OUTPUT_CONTRACT}`,
						},
					],
					timestamp: Date.now(),
				},
			],
		},
		{
			timeoutMs: NAMING_TIMEOUT_MS,
			sessionId: ctx.sessionManager.getSessionId(),
			...(reasoning ? { reasoning } : {}),
		},
	).result();

	if (response.stopReason === "error") {
		throw new Error(response.errorMessage || "Naming model returned an error");
	}
	if (response.stopReason === "aborted") throw new Error("Naming was aborted");

	const text = response.content
		.flatMap((block) => block.type === "text" ? [block.text] : [])
		.join("\n");
	const name = extractSessionName(text);
	if (!name) throw new Error("Naming model returned no valid session name");
	return name;
}

function parseNonNegativeInt(value: string | undefined): number | undefined {
	if (value === undefined || !/^\d+$/.test(value.trim())) return undefined;
	const parsed = Number(value.trim());
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function showRenameSettings(ctx: ExtensionCommandContext): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify("/rename settings requires an interactive client", "error");
		return;
	}

	const path = renameConfigPath();
	for (;;) {
		const config = loadRenameConfig(path).value;
		const choice = await ctx.ui.select("Session rename settings", [
			`model: ${config.model || DEFAULT_MODEL_OPTION}`,
			`thinkingLevel: ${config.thinkingLevel}`,
			`afterSteps: ${config.afterSteps}`,
			`everySteps: ${config.everySteps}`,
			"Done",
		]);
		if (!choice || choice === "Done") return;

		if (choice.startsWith("model:")) {
			const selected = await ctx.ui.select("Naming model", [
				DEFAULT_MODEL_OPTION,
				...ctx.modelRegistry.getAvailable().map((model) => `${model.provider}/${model.id}`),
			]);
			if (selected === undefined) continue;
			const model = selected === DEFAULT_MODEL_OPTION ? "" : selected;
			saveRenameConfig(path, { model });
			ctx.ui.notify(`Naming model set to ${model || DEFAULT_MODEL_OPTION}`, "info");
			continue;
		}

		if (choice.startsWith("thinkingLevel:")) {
			const selected = await ctx.ui.select("Thinking level", [...THINKING_LEVELS]);
			if (selected === undefined) continue;
			const thinkingLevel = selected as ThinkingLevelValue;
			saveRenameConfig(path, { thinkingLevel });
			ctx.ui.notify(`Naming thinking level set to ${thinkingLevel}`, "info");
			continue;
		}

		if (choice.startsWith("afterSteps:")) {
			const input = await ctx.ui.input(
				"First automatic rename after N user-agent turns (0 disables)",
				String(config.afterSteps),
			);
			const afterSteps = parseNonNegativeInt(input);
			if (afterSteps === undefined) {
				ctx.ui.notify("afterSteps must be a non-negative integer", "warning");
				continue;
			}
			saveRenameConfig(path, { afterSteps });
			ctx.ui.notify(`First automatic rename after ${afterSteps} turns`, "info");
			continue;
		}

		if (choice.startsWith("everySteps:")) {
			const input = await ctx.ui.input(
				"Refresh the name every N user-agent turns (0 names once)",
				String(config.everySteps),
			);
			const everySteps = parseNonNegativeInt(input);
			if (everySteps === undefined) {
				ctx.ui.notify("everySteps must be a non-negative integer", "warning");
				continue;
			}
			saveRenameConfig(path, { everySteps });
			ctx.ui.notify(`Automatic rename interval set to ${everySteps} turns`, "info");
		}
	}
}

async function runRename(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<boolean> {
	await ctx.waitForIdle();
	const { value: config, warnings } = loadRenameConfig(renameConfigPath());
	for (const warning of warnings) notify(ctx, warning, "warning");

	ctx.ui.setStatus(STATUS_KEY, "renaming…");
	try {
		const name = await generateSessionName(ctx, config);
		pi.setSessionName(name);
		notify(ctx, `Session name set: ${name}`, "info");
		return true;
	} catch (error) {
		notify(ctx, error instanceof Error ? error.message : String(error), "error");
		return false;
	} finally {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}
}

export default function (pi: ExtensionAPI): void {
	let autoRenameRunning = false;
	let sessionEpoch = 0;
	let autoOwned = false;

	pi.registerCommand("rename", {
		description: "Generate or set a concise session topic",
		getArgumentCompletions: getRenameArgumentCompletions,
		handler: async (args, ctx) => {
			const command = parseRenameCommand(args);
			if (command.kind === "settings") {
				await showRenameSettings(ctx);
				return;
			}
			if (command.kind === "set-name") {
				if (!command.name) {
					notify(ctx, "Session name cannot be empty", "warning");
					return;
				}
				autoOwned = false;
				pi.setSessionName(command.name);
				notify(ctx, `Session name set: ${command.name}`, "info");
				return;
			}
			if (await runRename(pi, ctx)) autoOwned = true;
		},
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (autoRenameRunning || (pi.getSessionName() && !autoOwned)) return;
		const epoch = sessionEpoch;
		const { value: config, warnings } = loadRenameConfig(renameConfigPath());
		for (const warning of warnings) notify(ctx, warning, "warning");

		const turns = ctx.sessionManager.getBranch().filter(
			(entry) => entry.type === "message" && entry.message.role === "user",
		).length;
		if (!isNamingDue(turns, config.afterSteps, config.everySteps)) return;

		autoRenameRunning = true;
		ctx.ui.setStatus(STATUS_KEY, "renaming…");
		try {
			const name = await generateSessionName(ctx, config);
			if (!shouldApplyAutoName(epoch, sessionEpoch, pi.getSessionName(), autoOwned)) return;
			autoOwned = true;
			pi.setSessionName(name);
			notify(ctx, `Session name set: ${name}`, "info");
		} catch (error) {
			notify(ctx, `Automatic rename failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
		} finally {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			autoRenameRunning = false;
		}
	});

	pi.on("session_shutdown", () => {
		sessionEpoch += 1;
		autoRenameRunning = false;
		autoOwned = false;
	});
}

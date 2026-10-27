import {
	AssistantMessageComponent,
	copyToClipboard,
	type ExtensionAPI,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	backgroundAnsi,
	foregroundAnsi,
	Markdown,
	rgbColor,
} from "@earendil-works/pi-tui";
import {
	LEFT_PANEL_EDGE,
	RIGHT_PANEL_EDGE,
	stabilizeThinkingToolSpacing,
	type ThinkingLayout,
} from "../lib/transcript-layout.ts";

import { attachMessageControls, codeBlocks, type MessageControlState } from "../lib/message-controls.ts";

const controls = new WeakSet<object>();
const states = new WeakMap<object, MessageControlState>();
let latestState: MessageControlState | undefined;
let latestSource = "";
let notify: (message: string, error?: boolean) => void = () => {};

const ORIGINAL_RENDER = Symbol.for("will.pi.assistant-background.original-render");
const WRAPPED_RENDER = Symbol.for("will.pi.assistant-background.wrapped-render");
const APPLIED_STYLE = Symbol.for("will.pi.assistant-background.applied-style");

let activeTheme: Theme | undefined;

type DefaultTextStyle = {
	bgColor?: (text: string) => string;
	[key: string]: unknown;
};

// Explicit runtime seam: intersecting with Markdown would conflict with its private fields.
type MarkdownInternals = {
	invalidate(): void;
	defaultTextStyle?: DefaultTextStyle;
	paddingY: number;
	[APPLIED_STYLE]?: (text: string) => string;
};

type AssistantInternals = {
	contentContainer?: { children?: unknown[] };
	lastMessage?: {
		content?: Array<{ type: string; text?: string; thinking?: string }>;
	};
	render(width: number): string[];
};

function assistantBackground(text: string, panelEdges = true): string {
	if (!activeTheme) return text;

	// Neutral grays chosen to sit clearly above the terminal background while
	// preserving strong contrast with the theme's ordinary Markdown colors.
	const color = activeTheme.appearance === "dark"
		? rgbColor(48, 48, 52)
		: rgbColor(226, 226, 230);
	const mode = activeTheme.getColorMode();
	const background = backgroundAnsi(color, mode);

	if (!panelEdges || text.length < 2 || text[0] !== " " || text.at(-1) !== " ") {
		return `${background}${text}\x1b[49m`;
	}

	const foreground = foregroundAnsi(color, mode);
	return `\x1b[49m${foreground}${LEFT_PANEL_EDGE}\x1b[39m${background}${text.slice(1, -1)}\x1b[49m${foreground}${RIGHT_PANEL_EDGE}\x1b[39m`;
}

function messageLayout(component: AssistantInternals): ThinkingLayout {
	const content = component.lastMessage?.content ?? [];
	return {
		hasThinking: content.some((part) => part.type === "thinking" && part.thinking?.trim()),
		hasProse: content.some((part) => part.type === "text" && part.text?.trim()),
		hasToolCall: content.some((part) => part.type === "toolCall"),
	};
}

function styleTextBlocks(component: AssistantInternals): void {
	for (const child of component.contentContainer?.children ?? []) {
		// Assistant prose is a direct Markdown child. Thinking is deliberately
		// wrapped in a MouseRegion, giving us a narrow runtime seam even though Pi
		// does not expose a public assistant-message renderer API.
		if (!(child instanceof Markdown)) continue;

		let state = states.get(component);
		if (!state) states.set(component, state = { plain: false });
		latestState = state;
		latestSource = (child as unknown as { text: string }).text;
		if (!controls.has(child)) {
			attachMessageControls(child as unknown as Parameters<typeof attachMessageControls>[0], state, (message, error) => notify(message, error), (text, plain) => {
				const label = activeTheme ? activeTheme.fg("mdCodeBlockBorder", text) : text;
				return plain ? label : assistantBackground(label, false);
			});
			controls.add(child);
		}
		const markdown = child as unknown as MarkdownInternals;
		if (markdown[APPLIED_STYLE] === assistantBackground && markdown.paddingY === 1) continue;
		markdown.defaultTextStyle = {
			...markdown.defaultTextStyle,
			bgColor: assistantBackground,
		};
		markdown.paddingY = 1;
		markdown[APPLIED_STYLE] = assistantBackground;
		markdown.invalidate();
	}
}

function patchAssistantRendering(): void {
	const target = AssistantMessageComponent.prototype as unknown as AssistantInternals & Record<PropertyKey, unknown>;
	const installedWrapper = target[WRAPPED_RENDER] as AssistantInternals["render"] | undefined;
	const savedOriginal = target[ORIGINAL_RENDER] as AssistantInternals["render"] | undefined;
	const original = installedWrapper && target.render === installedWrapper && savedOriginal
		? savedOriginal
		: target.render;

	const wrapper = function (this: AssistantInternals, width: number): string[] {
		styleTextBlocks(this);
		return stabilizeThinkingToolSpacing(original.call(this, width), messageLayout(this));
	};

	Object.defineProperty(target, ORIGINAL_RENDER, { value: original, configurable: true, writable: true });
	Object.defineProperty(target, WRAPPED_RENDER, { value: wrapper, configurable: true, writable: true });
	target.render = wrapper;
}

export default function (pi: ExtensionAPI): void {
	patchAssistantRendering();
	pi.registerCommand("plain-text", {
		description: "Toggle plain text for the last rendered assistant message",
		handler: async (_args, ctx) => {
			if (latestState) latestState.plain = !latestState.plain;
			ctx.ui.notify(latestState ? (latestState.plain ? "Plain text" : "Formatted") : "No assistant message yet", "info");
		},
	});

	pi.registerCommand("copy-code", {
		description: "Copy code from the last rendered assistant text block",
		handler: async (_args, ctx) => {
			const blocks = codeBlocks(latestSource);
			if (!blocks.length) { ctx.ui.notify("No code in the last assistant text block", "info"); return; }
			try {
				await copyToClipboard(blocks.join("\n\n"));
				ctx.ui.notify("Code copied", "info");
			} catch { ctx.ui.notify("Could not copy code", "error"); }
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		latestState = undefined;
		latestSource = "";
		notify = (message, error) => ctx.ui.notify(message, error ? "error" : "info");
		activeTheme = ctx.ui.theme;
		ctx.ui.setStatus("pi-customization:assistant-background", "assistant-bg");
	});
}

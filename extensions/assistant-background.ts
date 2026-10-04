import {
	AssistantMessageComponent,
	type ExtensionAPI,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { backgroundAnsi, Markdown, rgbColor } from "@earendil-works/pi-tui";

const ORIGINAL_RENDER = Symbol.for("will.pi.assistant-background.original-render");
const WRAPPED_RENDER = Symbol.for("will.pi.assistant-background.wrapped-render");
const APPLIED_STYLE = Symbol.for("will.pi.assistant-background.applied-style");

let activeTheme: Theme | undefined;

type DefaultTextStyle = {
	bgColor?: (text: string) => string;
	[key: string]: unknown;
};

type MarkdownInternals = Markdown & {
	defaultTextStyle?: DefaultTextStyle;
	[APPLIED_STYLE]?: (text: string) => string;
};

type AssistantInternals = {
	contentContainer?: { children?: unknown[] };
	render(width: number): string[];
};

function assistantBackground(text: string): string {
	if (!activeTheme) return text;

	// Neutral grays chosen to sit clearly above the terminal background while
	// preserving strong contrast with the theme's ordinary Markdown colors.
	const color = activeTheme.appearance === "dark"
		? rgbColor(48, 48, 52)
		: rgbColor(226, 226, 230);
	return `${backgroundAnsi(color, activeTheme.getColorMode())}${text}\x1b[49m`;
}

function styleTextBlocks(component: AssistantInternals): void {
	for (const child of component.contentContainer?.children ?? []) {
		// Assistant prose is a direct Markdown child. Thinking is deliberately
		// wrapped in a MouseRegion, giving us a narrow runtime seam even though Pi
		// does not expose a public assistant-message renderer API.
		if (!(child instanceof Markdown)) continue;

		const markdown = child as MarkdownInternals;
		if (markdown[APPLIED_STYLE] === assistantBackground) continue;
		markdown.defaultTextStyle = {
			...markdown.defaultTextStyle,
			bgColor: assistantBackground,
		};
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
		return original.call(this, width);
	};

	Object.defineProperty(target, ORIGINAL_RENDER, { value: original, configurable: true, writable: true });
	Object.defineProperty(target, WRAPPED_RENDER, { value: wrapper, configurable: true, writable: true });
	target.render = wrapper;
}

export default function (pi: ExtensionAPI): void {
	patchAssistantRendering();

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode === "tui") activeTheme = ctx.ui.theme;
	});
}

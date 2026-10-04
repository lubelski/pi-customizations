import {
	AssistantMessageComponent,
	type ExtensionAPI,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	backgroundAnsi,
	foregroundAnsi,
	Markdown,
	rgbColor,
	stripTerminalSequences,
	visibleWidth,
} from "@earendil-works/pi-tui";

const ORIGINAL_RENDER = Symbol.for("will.pi.assistant-background.original-render");
const WRAPPED_RENDER = Symbol.for("will.pi.assistant-background.wrapped-render");
const APPLIED_STYLE = Symbol.for("will.pi.assistant-background.applied-style");
const LEFT_EDGE = "▐"; // right half block
const RIGHT_EDGE = "▌"; // left half block
const BLANK_PANEL_LINE = /^▐ *▌$/u;

let activeTheme: Theme | undefined;

type DefaultTextStyle = {
	bgColor?: (text: string) => string;
	[key: string]: unknown;
};

type MarkdownInternals = Markdown & {
	defaultTextStyle?: DefaultTextStyle;
	paddingY: number;
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
	const mode = activeTheme.getColorMode();
	const background = backgroundAnsi(color, mode);

	if (text.length < 2 || text[0] !== " " || text.at(-1) !== " ") {
		return `${background}${text}\x1b[49m`;
	}

	const foreground = foregroundAnsi(color, mode);
	return `\x1b[49m${foreground}${LEFT_EDGE}\x1b[39m${background}${text.slice(1, -1)}\x1b[49m${foreground}${RIGHT_EDGE}\x1b[39m`;
}

function chamferLine(line: string, edge: "top" | "bottom"): string {
	const plain = stripTerminalSequences(line);
	const left = line.indexOf(LEFT_EDGE);
	const right = line.lastIndexOf(RIGHT_EDGE);
	if (!BLANK_PANEL_LINE.test(plain) || left < 0 || right <= left) return line;

	const middleWidth = visibleWidth(plain) - 2;
	const fill = edge === "top" ? "🬭" : "🬂";
	const leftCorner = edge === "top" ? "🬞" : "🬁";
	const rightCorner = edge === "top" ? "🬏" : "🬀";
	return line.slice(0, left) + leftCorner + fill.repeat(middleWidth) + rightCorner + line.slice(right + 1);
}

function shapePanelCaps(lines: string[]): string[] {
	const blankPanelLines: number[] = [];
	for (let index = 0; index < lines.length; index++) {
		if (BLANK_PANEL_LINE.test(stripTerminalSequences(lines[index]))) blankPanelLines.push(index);
	}
	if (blankPanelLines.length < 2) return lines;

	const result = [...lines];
	const top = blankPanelLines[0];
	const bottom = blankPanelLines.at(-1)!;
	result[top] = chamferLine(result[top], "top");
	result[bottom] = chamferLine(result[bottom], "bottom");
	return result;
}

function styleTextBlocks(component: AssistantInternals): void {
	for (const child of component.contentContainer?.children ?? []) {
		// Assistant prose is a direct Markdown child. Thinking is deliberately
		// wrapped in a MouseRegion, giving us a narrow runtime seam even though Pi
		// does not expose a public assistant-message renderer API.
		if (!(child instanceof Markdown)) continue;

		const markdown = child as MarkdownInternals;
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
		return shapePanelCaps(original.call(this, width));
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

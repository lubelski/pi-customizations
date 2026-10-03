import {
	AssistantMessageComponent,
	BranchSummaryMessageComponent,
	CompactionSummaryMessageComponent,
	CustomMessageComponent,
	SkillInvocationMessageComponent,
	Theme,
	ToolExecutionComponent,
	UserMessageComponent,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { foregroundAnsi, stripTerminalSequences } from "@earendil-works/pi-tui";

const PANEL_BACKGROUNDS = new Set([
	"userMessageBg",
	"customMessageBg",
	"toolPendingBg",
	"toolSuccessBg",
	"toolErrorBg",
]);

const ORIGINAL_BG = Symbol.for("will.pi.half-bleed.original-bg");
const ORIGINAL_FG = Symbol.for("will.pi.half-bleed.original-fg");
const ORIGINAL_RENDER = Symbol.for("will.pi.half-bleed.original-render");
const LEFT_EDGE = "▐"; // right half block
const RIGHT_EDGE = "▌"; // left half block
const BLANK_PANEL_LINE = /^▐ *▌$/u;
const OSC_SEQUENCE = /\x1b\][^\x07]*(?:\x07|\x1b\\)/gu;

const PANEL_COMPONENTS = [
	UserMessageComponent,
	ToolExecutionComponent,
	CustomMessageComponent,
	BranchSummaryMessageComponent,
	CompactionSummaryMessageComponent,
	SkillInvocationMessageComponent,
];

type PatchableTheme = Theme & {
	getBgAnsi(color: string): string;
	getColorMode(): Parameters<typeof foregroundAnsi>[1];
};

type Renderable = {
	render(width: number): string[];
};

function extractOscSequences(line: string): string {
	return [...line.matchAll(OSC_SEQUENCE)].map((match) => match[0]).join("");
}

function removeVerticalPadding(lines: string[]): string[] {
	const blankPanelLines: number[] = [];
	for (let index = 0; index < lines.length; index++) {
		if (BLANK_PANEL_LINE.test(stripTerminalSequences(lines[index]))) blankPanelLines.push(index);
	}
	if (blankPanelLines.length < 2) return lines;

	const top = blankPanelLines[0];
	const bottom = blankPanelLines.at(-1)!;
	if (top === bottom) return lines;

	const topOsc = extractOscSequences(lines[top]);
	const bottomOsc = extractOscSequences(lines[bottom]);
	const result = lines.filter((_line, index) => index !== top && index !== bottom);
	if (result.length === 0) return result;

	if (result.length === 1) result[0] = topOsc + bottomOsc + result[0];
	else {
		result[0] = topOsc + result[0];
		result[result.length - 1] = bottomOsc + result[result.length - 1];
	}
	return result;
}

function patchPanelComponent(ComponentClass: { prototype: Renderable }): void {
	const target = ComponentClass.prototype as Renderable & Record<PropertyKey, unknown>;
	const original = (target[ORIGINAL_RENDER] as Renderable["render"] | undefined) ?? target.render;

	if (!Object.hasOwn(target, ORIGINAL_RENDER)) {
		Object.defineProperty(target, ORIGINAL_RENDER, { value: original, configurable: true });
	}

	target.render = function (this: Renderable, width: number): string[] {
		return removeVerticalPadding(original.call(this, width));
	};
}

function patchPanelBackgrounds(): void {
	const target = Theme.prototype as unknown as Record<PropertyKey, unknown> & { bg: Theme["bg"] };
	const original = (target[ORIGINAL_BG] as Theme["bg"] | undefined) ?? target.bg;

	if (!Object.hasOwn(target, ORIGINAL_BG)) {
		Object.defineProperty(target, ORIGINAL_BG, { value: original, configurable: true });
	}

	target.bg = function (this: PatchableTheme, color: Parameters<Theme["bg"]>[0], text: string): string {
		if (!PANEL_BACKGROUNDS.has(color) || text.length < 2 || text[0] !== " " || text.at(-1) !== " ") {
			return original.call(this, color, text);
		}

		const background = this.getBgAnsi(color);
		if (background === "\x1b[49m") return original.call(this, color, text);

		const foreground = foregroundAnsi(this.colors[color], this.getColorMode());
		const middle = text.slice(1, -1);
		return `\x1b[49m${foreground}${LEFT_EDGE}\x1b[39m${background}${middle}\x1b[49m${foreground}${RIGHT_EDGE}\x1b[39m`;
	} as Theme["bg"];
}

function restoreRemovedExperiments(): void {
	// `/reload` keeps patched prototypes alive. Restore prior wrappers before
	// installing this revision so experiments never stack.
	const assistant = AssistantMessageComponent.prototype as Renderable & Record<PropertyKey, unknown>;
	const originalRender = assistant[ORIGINAL_RENDER] as Renderable["render"] | undefined;
	if (originalRender) {
		assistant.render = originalRender;
		delete assistant[ORIGINAL_RENDER];
	}

	const theme = Theme.prototype as unknown as Record<PropertyKey, unknown> & {
		bg: Theme["bg"];
		fg: Theme["fg"];
	};
	const originalBg = theme[ORIGINAL_BG] as Theme["bg"] | undefined;
	if (originalBg) {
		theme.bg = originalBg;
		delete theme[ORIGINAL_BG];
	}
	const originalFg = theme[ORIGINAL_FG] as Theme["fg"] | undefined;
	if (originalFg) {
		theme.fg = originalFg;
		delete theme[ORIGINAL_FG];
	}
}

export default function (_pi: ExtensionAPI): void {
	restoreRemovedExperiments();
	patchPanelBackgrounds();
	for (const ComponentClass of PANEL_COMPONENTS) patchPanelComponent(ComponentClass);
}

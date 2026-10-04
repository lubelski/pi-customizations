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
import { foregroundAnsi, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";

const TOOL_BACKGROUNDS = new Set([
	"toolPendingBg",
	"toolSuccessBg",
	"toolErrorBg",
]);

const PANEL_BACKGROUNDS = new Set([
	"userMessageBg",
	"customMessageBg",
	...TOOL_BACKGROUNDS,
]);

const ORIGINAL_BG = Symbol.for("will.pi.half-bleed.original-bg");
const ORIGINAL_FG = Symbol.for("will.pi.half-bleed.original-fg");
const ORIGINAL_RENDER = Symbol.for("will.pi.half-bleed.original-render");
const LEFT_EDGE = "▐"; // right half block
const RIGHT_EDGE = "▌"; // left half block
const BLANK_PANEL_LINE = /^▐ *▌$/u;

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

function chamferLine(line: string, edge: "top" | "bottom"): string {
	const plain = stripTerminalSequences(line);
	const left = line.indexOf(LEFT_EDGE);
	const right = line.lastIndexOf(RIGHT_EDGE);
	if (!BLANK_PANEL_LINE.test(plain) || left < 0 || right <= left) return line;

	const middleWidth = visibleWidth(plain) - 2;

	// Sextants provide the exact rectangular intersection requested: half a
	// cell horizontally and one third of a row vertically, with no diagonal.
	const fill = edge === "top" ? "🬭" : "🬂"; // lower third / upper third
	const leftCorner = edge === "top" ? "🬞" : "🬁"; // sextant 6 / sextant 2
	const rightCorner = edge === "top" ? "🬏" : "🬀"; // sextant 5 / sextant 1

	return line.slice(0, left) + leftCorner + fill.repeat(middleWidth) + rightCorner + line.slice(right + 1);
}

function addVerticalThirdCells(lines: string[]): string[] {
	const blankPanelLines: number[] = [];
	for (let index = 0; index < lines.length; index++) {
		if (BLANK_PANEL_LINE.test(stripTerminalSequences(lines[index]))) blankPanelLines.push(index);
	}
	if (blankPanelLines.length < 2) return lines;

	const top = blankPanelLines[0];
	const bottom = blankPanelLines.at(-1)!;
	if (top === bottom) return lines;

	const result = [...lines];
	result[top] = chamferLine(result[top], "top");
	result[bottom] = chamferLine(result[bottom], "bottom");
	return result;
}

function patchPanelComponent(ComponentClass: { prototype: Renderable }): void {
	const target = ComponentClass.prototype as Renderable & Record<PropertyKey, unknown>;
	const original = (target[ORIGINAL_RENDER] as Renderable["render"] | undefined) ?? target.render;

	if (!Object.hasOwn(target, ORIGINAL_RENDER)) {
		Object.defineProperty(target, ORIGINAL_RENDER, { value: original, configurable: true });
	}

	target.render = function (this: Renderable, width: number): string[] {
		return addVerticalThirdCells(original.call(this, width));
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

		if (TOOL_BACKGROUNDS.has(color)) {
			// Tool panels should read as transcript scaffolding, not as messages.
			// Replace their filled box with one thin, low-salience left rule. Keep
			// errors distinct without restoring the full error background.
			const edgeColor = color === "toolErrorBg" ? this.colors.error : this.colors.borderMuted;
			const edge = foregroundAnsi(edgeColor, this.getColorMode());
			return `\x1b[49m${edge}│\x1b[39m${text.slice(1)}`;
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

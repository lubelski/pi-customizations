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

	// Standard 2×2 quadrant blocks trade the sharper sextant diagonals for a
	// softer, widely supported faux-round corner. The half-row cap also pairs
	// symmetrically with the half-cell side edges.
	const fill = edge === "top" ? "▄" : "▀";
	const leftCorner = edge === "top" ? "▗" : "▝";
	const rightCorner = edge === "top" ? "▖" : "▘";

	// Keep the existing OSC markers and color setup before the first visible
	// cell, plus the ANSI cleanup after the last one.
	return line.slice(0, left) + leftCorner + fill.repeat(middleWidth) + rightCorner + line.slice(right + 1);
}

function addVerticalHalfCells(lines: string[]): string[] {
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
		return addVerticalHalfCells(original.call(this, width));
	};
}

function restoreRemovedAssistantExperiment(): void {
	// Older revisions patched assistant rendering and Theme.fg(). `/reload`
	// keeps those prototypes alive, so explicitly restore Pi's originals.
	const assistant = AssistantMessageComponent.prototype as Renderable & Record<PropertyKey, unknown>;
	const originalRender = assistant[ORIGINAL_RENDER] as Renderable["render"] | undefined;
	if (originalRender) {
		assistant.render = originalRender;
		delete assistant[ORIGINAL_RENDER];
	}

	const theme = Theme.prototype as unknown as Record<PropertyKey, unknown> & { fg: Theme["fg"] };
	const originalFg = theme[ORIGINAL_FG] as Theme["fg"] | undefined;
	if (originalFg) {
		theme.fg = originalFg;
		delete theme[ORIGINAL_FG];
	}
}

function patchPanelBackgrounds(): void {
	const target = Theme.prototype as unknown as Record<PropertyKey, unknown> & {
		bg: Theme["bg"];
	};
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

		// Half-cell side edges are supported reliably by terminal fonts and split
		// the original padding evenly between exterior margin and interior space.
		return `\x1b[49m${foreground}${LEFT_EDGE}\x1b[39m${background}${middle}\x1b[49m${foreground}${RIGHT_EDGE}\x1b[39m`;
	} as Theme["bg"];
}

export default function (_pi: ExtensionAPI): void {
	restoreRemovedAssistantExperiment();
	patchPanelBackgrounds();
	for (const ComponentClass of PANEL_COMPONENTS) patchPanelComponent(ComponentClass);
}

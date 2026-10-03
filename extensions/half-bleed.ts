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
const BLANK_LEFT_EDGE_LINE = /^▐ *$/u;

const TWO_SIDED_PANEL_COMPONENTS = [
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

let activeTheme: PatchableTheme | undefined;

function chamferLine(line: string, edge: "top" | "bottom", bleedRight: boolean): string {
	const plain = stripTerminalSequences(line);
	const blankLinePattern = bleedRight ? BLANK_LEFT_EDGE_LINE : BLANK_PANEL_LINE;
	const left = line.indexOf(LEFT_EDGE);
	const right = line.lastIndexOf(RIGHT_EDGE);
	if (!blankLinePattern.test(plain) || left < 0 || (!bleedRight && right <= left)) return line;

	const horizontalEdges = bleedRight ? 1 : 2;
	const middleWidth = visibleWidth(plain) - horizontalEdges;

	// Symbols for Legacy Computing divides a cell into 2×3 sextants. The edge
	// fills are exactly one third of a row; the corner glyphs are filled
	// triangles whose legs are half a cell wide and one third of a cell tall.
	// In a typical terminal cell that produces a roughly 5 px diagonal clip.
	const fill = edge === "top" ? "🬭" : "🬂"; // sextants 56 (bottom third) / 12 (top third)
	const leftCorner = edge === "top" ? "🭇" : "🭢";
	const rightCorner = edge === "top" ? "🬼" : "🭗";

	// Keep the existing OSC markers and color setup before the first visible
	// cell, plus the ANSI cleanup after the last one.
	if (!bleedRight) {
		return line.slice(0, left) + leftCorner + fill.repeat(middleWidth) + rightCorner + line.slice(right + 1);
	}

	const backgroundReset = line.lastIndexOf("\x1b[49m");
	if (backgroundReset <= left) return line;
	return line.slice(0, left) + leftCorner + fill.repeat(middleWidth) + "\x1b[39m" + line.slice(backgroundReset);
}

function addVerticalHalfCells(lines: string[], bleedRight: boolean): string[] {
	const blankLinePattern = bleedRight ? BLANK_LEFT_EDGE_LINE : BLANK_PANEL_LINE;
	const blankPanelLines: number[] = [];
	for (let index = 0; index < lines.length; index++) {
		if (blankLinePattern.test(stripTerminalSequences(lines[index]))) blankPanelLines.push(index);
	}
	if (blankPanelLines.length < 2) return lines;

	const top = blankPanelLines[0];
	const bottom = blankPanelLines.at(-1)!;
	if (top === bottom) return lines;

	const result = [...lines];
	result[top] = chamferLine(result[top], "top", bleedRight);
	result[bottom] = chamferLine(result[bottom], "bottom", bleedRight);
	return result;
}

function patchPanelComponent(ComponentClass: { prototype: Renderable }, bleedRight = false): void {
	const target = ComponentClass.prototype as Renderable & Record<PropertyKey, unknown>;
	const original = (target[ORIGINAL_RENDER] as Renderable["render"] | undefined) ?? target.render;

	if (!Object.hasOwn(target, ORIGINAL_RENDER)) {
		Object.defineProperty(target, ORIGINAL_RENDER, { value: original, configurable: true });
	}

	target.render = function (this: Renderable, width: number): string[] {
		return addVerticalHalfCells(original.call(this, width), bleedRight);
	};
}

function patchPanelBackgrounds(): void {
	const target = Theme.prototype as unknown as Record<PropertyKey, unknown> & {
		bg: Theme["bg"];
		fg: Theme["fg"];
	};
	const originalBg = (target[ORIGINAL_BG] as Theme["bg"] | undefined) ?? target.bg;
	const originalFg = (target[ORIGINAL_FG] as Theme["fg"] | undefined) ?? target.fg;

	if (!Object.hasOwn(target, ORIGINAL_BG)) {
		Object.defineProperty(target, ORIGINAL_BG, { value: originalBg, configurable: true });
	}
	if (!Object.hasOwn(target, ORIGINAL_FG)) {
		Object.defineProperty(target, ORIGINAL_FG, { value: originalFg, configurable: true });
	}

	target.fg = function (this: PatchableTheme, color: Parameters<Theme["fg"]>[0], text: string): string {
		activeTheme = this;
		return originalFg.call(this, color, text);
	} as Theme["fg"];

	target.bg = function (this: PatchableTheme, color: Parameters<Theme["bg"]>[0], text: string): string {
		activeTheme = this;
		if (!PANEL_BACKGROUNDS.has(color) || text.length < 2 || text[0] !== " " || text.at(-1) !== " ") {
			return originalBg.call(this, color, text);
		}

		const background = this.getBgAnsi(color);
		if (background === "\x1b[49m") return originalBg.call(this, color, text);

		const foreground = foregroundAnsi(this.colors[color], this.getColorMode());

		// User messages keep the shaped left edge but run uninterrupted to the
		// terminal's right edge. Other transcript panels retain both shaped sides.
		if (color === "userMessageBg") {
			return `\x1b[49m${foreground}${LEFT_EDGE}\x1b[39m${background}${text.slice(1)}\x1b[49m`;
		}

		const middle = text.slice(1, -1);
		return `\x1b[49m${foreground}${LEFT_EDGE}\x1b[39m${background}${middle}\x1b[49m${foreground}${RIGHT_EDGE}\x1b[39m`;
	} as Theme["bg"];
}

function assistantPanel(lines: string[], width: number): string[] {
	const currentTheme = activeTheme;
	if (!currentTheme || lines.length === 0 || width < 2) return lines;

	const background = currentTheme.getBgAnsi("toolPendingBg");
	if (background === "\x1b[49m") return lines;
	const foreground = foregroundAnsi(currentTheme.colors.toolPendingBg, currentTheme.getColorMode());

	const topFill = "🬭".repeat(width - 1);
	const bottomFill = "🬂".repeat(width - 1);
	const result = [...lines];
	const firstPlain = stripTerminalSequences(result[0]);
	const topEdge = `\x1b[49m${foreground}${topFill}🬼\x1b[39m`;
	if (firstPlain.length === 0) result[0] += topEdge;
	else result.unshift(topEdge);

	for (let index = 1; index < result.length; index++) {
		const line = result[index];
		if (visibleWidth(line) !== width || !line.endsWith(" ")) {
			result[index] = `${background}${line}\x1b[49m`;
			continue;
		}
		result[index] = `${background}${line.slice(0, -1)}\x1b[49m${foreground}${RIGHT_EDGE}\x1b[39m`;
	}

	result.push(`\x1b[49m${foreground}${bottomFill}🭗\x1b[39m`);
	return result;
}

function patchAssistantComponent(): void {
	const target = AssistantMessageComponent.prototype as Renderable & Record<PropertyKey, unknown>;
	const original = (target[ORIGINAL_RENDER] as Renderable["render"] | undefined) ?? target.render;

	if (!Object.hasOwn(target, ORIGINAL_RENDER)) {
		Object.defineProperty(target, ORIGINAL_RENDER, { value: original, configurable: true });
	}

	target.render = function (this: Renderable, width: number): string[] {
		return assistantPanel(original.call(this, width), width);
	};
}

export default function (_pi: ExtensionAPI): void {
	patchPanelBackgrounds();
	patchPanelComponent(UserMessageComponent, true);
	for (const ComponentClass of TWO_SIDED_PANEL_COMPONENTS) patchPanelComponent(ComponentClass);
	patchAssistantComponent();
}

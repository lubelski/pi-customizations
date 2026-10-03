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
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";

const ORIGINAL_BG = Symbol.for("will.pi.half-bleed.original-bg");
const ORIGINAL_FG = Symbol.for("will.pi.half-bleed.original-fg");
const ORIGINAL_RENDER = Symbol.for("will.pi.half-bleed.original-render");
const BLANK_PANEL_LINE = /^ +$/u;
const BACKGROUND_ANSI = /\x1b\[(48;2;\d+;\d+;\d+|48;5;\d+|4[0-7]|10[0-7])m/u;

const PANEL_COMPONENTS = [
	UserMessageComponent,
	ToolExecutionComponent,
	CustomMessageComponent,
	BranchSummaryMessageComponent,
	CompactionSummaryMessageComponent,
	SkillInvocationMessageComponent,
];

type Renderable = {
	render(width: number): string[];
};

function foregroundFromBackground(code: string): string | undefined {
	if (code.startsWith("48;")) return `\x1b[${code.replace(/^48;/u, "38;")}m`;
	const value = Number(code);
	if (value >= 40 && value <= 47) return `\x1b[${value - 10}m`;
	if (value >= 100 && value <= 107) return `\x1b[${value - 10}m`;
	return undefined;
}

function chamferLine(line: string, edge: "top" | "bottom"): string {
	const plain = stripTerminalSequences(line);
	const backgroundMatch = BACKGROUND_ANSI.exec(line);
	if (!BLANK_PANEL_LINE.test(plain) || !backgroundMatch || visibleWidth(plain) < 2) return line;

	const foreground = foregroundFromBackground(backgroundMatch[1]);
	if (!foreground) return line;
	const middleWidth = visibleWidth(plain) - 2;

	// The normal content row keeps Pi's full colored padding cell. Quadrants
	// shape only the half-row caps, leaving Pi's outer viewport gutter untouched.
	const fill = edge === "top" ? "▄" : "▀";
	const leftCorner = edge === "top" ? "▗" : "▝";
	const rightCorner = edge === "top" ? "▖" : "▘";

	// Preserve OSC markers before the background escape, then draw the cap as
	// foreground block elements over the terminal's default background.
	return `${line.slice(0, backgroundMatch.index)}\x1b[49m${foreground}${leftCorner}${fill.repeat(middleWidth)}${rightCorner}\x1b[39m`;
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

function restoreRemovedExperiments(): void {
	// `/reload` keeps patched prototypes alive. Restore experiments that this
	// revision no longer uses before installing the current component wrappers.
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
	for (const ComponentClass of PANEL_COMPONENTS) patchPanelComponent(ComponentClass);
}

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
import { foregroundAnsi, mixColors, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import {
	LEFT_PANEL_EDGE,
	RIGHT_PANEL_EDGE,
	shapePanelCaps,
	trimToolRulePadding,
} from "../lib/pi-customizations/transcript-layout.ts";

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

function patchPanelComponent(ComponentClass: { prototype: Renderable }): void {
	const target = ComponentClass.prototype as Renderable & Record<PropertyKey, unknown>;
	const original = (target[ORIGINAL_RENDER] as Renderable["render"] | undefined) ?? target.render;

	if (!Object.hasOwn(target, ORIGINAL_RENDER)) {
		Object.defineProperty(target, ORIGINAL_RENDER, { value: original, configurable: true });
	}

	target.render = function (this: Renderable, width: number): string[] {
		const lines = original.call(this, width);
		return ComponentClass === ToolExecutionComponent
			? trimToolRulePadding(lines, stripTerminalSequences)
			: shapePanelCaps(lines, stripTerminalSequences, visibleWidth);
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
			const edgeColor = color === "toolErrorBg"
				? this.colors.error
				: mixColors(this.colors.toolPendingBg, this.colors.borderMuted, 0.25);
			const edge = foregroundAnsi(edgeColor, this.getColorMode());
			return `\x1b[49m${edge}│\x1b[39m${text.slice(1)}`;
		}

		const background = this.getBgAnsi(color);
		if (background === "\x1b[49m") return original.call(this, color, text);

		const foreground = foregroundAnsi(this.colors[color], this.getColorMode());
		const middle = text.slice(1, -1);
		return `\x1b[49m${foreground}${LEFT_PANEL_EDGE}\x1b[39m${background}${middle}\x1b[49m${foreground}${RIGHT_PANEL_EDGE}\x1b[39m`;
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

export default function (pi: ExtensionAPI): void {
	restoreRemovedExperiments();
	patchPanelBackgrounds();
	for (const ComponentClass of PANEL_COMPONENTS) patchPanelComponent(ComponentClass);

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode === "tui") ctx.ui.setStatus("pi-customization:half-bleed", "half-bleed");
	});
}

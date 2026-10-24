import {
	Theme,
	ToolExecutionComponent,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

import { stripTerminalSequences, truncateToWidth, type TuiMouseEvent, type TuiMouseEventResult } from "@earendil-works/pi-tui";

let currentTheme: (() => Theme) | undefined;
const ORIGINAL_MOUSE = Symbol.for("will.pi.recessed-tools.original-mouse");
const WRAPPED_MOUSE = Symbol.for("will.pi.recessed-tools.wrapped-mouse");

/** Deliberately omit payloads/scripts: the transcript should foreground prose. */
export function toolSummary(name: string, args: Record<string, unknown>, failed: boolean): string {
	const target = [args.path, args.file_path, args.command, args.query, args.url]
		.find((value): value is string => typeof value === "string" && value.length > 0);
	const clean = (value: string) => stripTerminalSequences(value).replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
	return `${failed ? "✗" : "›"} ${clean(name)}${target ? ` · ${clean(target)}` : ""}${failed ? " · failed" : ""}`;
}

const ORIGINAL_RENDER = Symbol.for("will.pi.recessed-tools.original-render");
const WRAPPED_RENDER = Symbol.for("will.pi.recessed-tools.wrapped-render");
const ORIGINAL_BG = Symbol.for("will.pi.recessed-tools.original-bg");
const WRAPPED_BG = Symbol.for("will.pi.recessed-tools.wrapped-bg");
const ORIGINAL_FG = Symbol.for("will.pi.recessed-tools.original-fg");
const WRAPPED_FG = Symbol.for("will.pi.recessed-tools.wrapped-fg");

type ToolComponent = {
	render(width: number): string[];
	expanded?: boolean;
	toolName?: string;
	args?: Record<string, unknown>;
	isPartial?: boolean;
	result?: { isError?: boolean };
	setExpanded(expanded: boolean): void;
	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined;
	ui?: { requestRender(): void };
};

type PatchTarget<T> = T & Record<PropertyKey, unknown>;

function currentBase<T extends (...args: any[]) => any>(
	target: Record<PropertyKey, unknown>,
	method: T,
	originalKey: symbol,
	wrapperKey: symbol,
): T {
	const installedWrapper = target[wrapperKey] as T | undefined;
	const savedOriginal = target[originalKey] as T | undefined;
	return installedWrapper && method === installedWrapper && savedOriginal ? savedOriginal : method;
}

function setPatch<T extends (...args: any[]) => any>(
	target: Record<PropertyKey, unknown>,
	originalKey: symbol,
	wrapperKey: symbol,
	original: T,
	wrapper: T,
): void {
	Object.defineProperty(target, originalKey, { value: original, configurable: true, writable: true });
	Object.defineProperty(target, wrapperKey, { value: wrapper, configurable: true, writable: true });
}

function patchToolHeight(): void {
	const target = ToolExecutionComponent.prototype as unknown as PatchTarget<ToolComponent>;
	const original = currentBase(target, target.render, ORIGINAL_RENDER, WRAPPED_RENDER);

	const summarized = (component: ToolComponent) => currentTheme && !component.expanded &&
		component.isPartial === false && component.result && typeof component.toolName === "string";
	const wrapper = function (this: ToolComponent, width: number): string[] {
		if (!summarized(this)) return original.call(this, width);
		if (width <= 0) return [];
		const summary = toolSummary(this.toolName!, this.args ?? {}, !!this.result?.isError);
		return [currentTheme!().fg(this.result?.isError ? "error" : "dim", truncateToWidth(summary, width))];
	};

	// The compact row owns its hit area; never send its coordinates into the
	// hidden native component tree. Expanded/running tools retain native input.
	const originalMouse = currentBase(target, target.handleMouse, ORIGINAL_MOUSE, WRAPPED_MOUSE);
	const mouse = function (this: ToolComponent, event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (!summarized(this)) return originalMouse.call(this, event);
		if (event.y === 0 && event.type === "click" && event.button === "left") {
			this.setExpanded(true);
			this.ui?.requestRender();
			return { handled: true };
		}
		return undefined;
	};
	setPatch(target, ORIGINAL_MOUSE, WRAPPED_MOUSE, originalMouse, mouse);
	target.handleMouse = mouse;
	setPatch(target, ORIGINAL_RENDER, WRAPPED_RENDER, original, wrapper);
	target.render = wrapper;
}

function patchToolColors(): void {
	const target = Theme.prototype as unknown as PatchTarget<{
		bg: Theme["bg"];
		fg: Theme["fg"];
	}>;
	const originalBg = currentBase(target, target.bg, ORIGINAL_BG, WRAPPED_BG);
	const originalFg = currentBase(target, target.fg, ORIGINAL_FG, WRAPPED_FG);

	const bgWrapper = function (
		this: Theme,
		color: Parameters<Theme["bg"]>[0],
		text: string,
	): string {
		// Completed tools use the same quiet neutral panel as pending tools.
		// Errors retain their distinct background so failures remain noticeable.
		const recessedColor = color === "toolSuccessBg" ? "toolPendingBg" : color;
		return originalBg.call(this, recessedColor, text);
	} as Theme["bg"];

	const fgWrapper = function (
		this: Theme,
		color: Parameters<Theme["fg"]>[0],
		text: string,
	): string {
		const recessedColor = color === "toolTitle" || color === "toolOutput" ? "dim" : color;
		return originalFg.call(this, recessedColor, text);
	} as Theme["fg"];

	setPatch(target, ORIGINAL_BG, WRAPPED_BG, originalBg, bgWrapper);
	setPatch(target, ORIGINAL_FG, WRAPPED_FG, originalFg, fgWrapper);
	target.bg = bgWrapper;
	target.fg = fgWrapper;
}

export default function (pi: ExtensionAPI): void {
	patchToolHeight();
	patchToolColors();

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode === "tui") {
			currentTheme = () => ctx.ui.theme;
			ctx.ui.setStatus("pi-customization:recessed-tools", "recessed-tools");
		}
	});
}

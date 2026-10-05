import {
	Theme,
	ToolExecutionComponent,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const COLLAPSED_MAX_LINES = 7;
const COLLAPSED_HEAD_LINES = 3;
const COLLAPSED_TAIL_LINES = COLLAPSED_MAX_LINES - COLLAPSED_HEAD_LINES;

const ORIGINAL_RENDER = Symbol.for("will.pi.recessed-tools.original-render");
const WRAPPED_RENDER = Symbol.for("will.pi.recessed-tools.wrapped-render");
const ORIGINAL_BG = Symbol.for("will.pi.recessed-tools.original-bg");
const WRAPPED_BG = Symbol.for("will.pi.recessed-tools.wrapped-bg");
const ORIGINAL_FG = Symbol.for("will.pi.recessed-tools.original-fg");
const WRAPPED_FG = Symbol.for("will.pi.recessed-tools.wrapped-fg");

type ToolComponent = {
	render(width: number): string[];
	expanded?: boolean;
	imageComponents?: unknown[];
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
	const target = ToolExecutionComponent.prototype as PatchTarget<ToolComponent>;
	const original = currentBase(target, target.render, ORIGINAL_RENDER, WRAPPED_RENDER);

	const wrapper = function (this: ToolComponent, width: number): string[] {
		const lines = original.call(this, width);
		if (this.expanded || (this.imageComponents?.length ?? 0) > 0 || lines.length <= COLLAPSED_MAX_LINES) {
			return lines;
		}

		// Keep both the tool's identity at the top and its summary, duration, or
		// expansion hint at the bottom. The ordinary expand action still reveals
		// the complete component.
		return [
			...lines.slice(0, COLLAPSED_HEAD_LINES),
			...lines.slice(-COLLAPSED_TAIL_LINES),
		];
	};

	setPatch(target, ORIGINAL_RENDER, WRAPPED_RENDER, original, wrapper);
	target.render = wrapper;
}

function patchToolColors(): void {
	const target = Theme.prototype as PatchTarget<{
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
		if (ctx.mode === "tui") ctx.ui.setStatus("pi-customization:recessed-tools", "recessed-tools");
	});
}

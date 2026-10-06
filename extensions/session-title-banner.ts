import { homedir } from "node:os";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { type Component, VStack, sliceByColumn, stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import { styleDivider } from "../lib/divider-style.ts";

const WIDGET_KEY = "session-title-banner";
function clean(value: string): string {
	return stripTerminalSequences(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
}

export function truncateMiddle(value: string, width: number): string {
	const text = clean(value);
	const size = visibleWidth(text);
	if (size <= width) return text;
	if (width < 5) return "";
	const head = Math.ceil((width - 2) / 2);
	const tail = Math.floor((width - 2) / 2);
	return sliceByColumn(text, 0, head, true) + ".." + sliceByColumn(text, size - tail, tail, true);
}

function shortCount(value: number): string {
	return value >= 1000 ? `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k` : String(value);
}

/** Title gets its full centered space before either secondary label is considered. */
export function renderTitleBanner(title: string | undefined, width: number, theme: Theme, cwd = "", usage = ""): string[] {
	if (width < 1) return [];
	const name = stripTerminalSequences(title ?? "")
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
		.replace(/\s+/g, " ").trim() || clean(cwd);
	const inset = width >= 6 ? 2 : 0;
	const label = stripTerminalSequences(truncateToWidth(name, Math.max(0, width - inset * 2), "…"));
	const remaining = Math.max(0, width - visibleWidth(label));
	const left = Math.floor(remaining / 2);
	const right = remaining - left;
	const leftText = truncateMiddle(cwd, Math.max(0, left - inset - 2));
	const usageText = clean(usage);
	const rightText = visibleWidth(usageText) <= right - inset - 2 ? usageText : "";
	const leftSide = leftText ? " ".repeat(inset) + leftText : "";
	const rightSide = rightText ? rightText + " ".repeat(inset) : "";
	const line = theme.fg("dim", leftSide + " ".repeat(left - visibleWidth(leftSide)))
		+ theme.style(label, { fg: "text", bold: true })
		+ theme.fg("dim", " ".repeat(right - visibleWidth(rightSide)) + rightSide);
	return [
		line,
		styleDivider(theme, "─".repeat(width)),
	];
}

export default function sessionTitleBanner(pi: ExtensionAPI): void {
	let requestRender: (() => void) | undefined;
	let cleanup: (() => void) | undefined;

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		cleanup?.();
		// Use an empty widget only to acquire the active renderer/theme. The title
		// belongs outside the transcript ScrollView, not in the input dock.
		ctx.ui.setWidget(WIDGET_KEY, (tui, theme) => {
			const host = tui as unknown as {
				layoutRoot?: Component;
				setLayoutRoot?: (root: Component | undefined) => void;
			};
			const original = host.layoutRoot;
			if (!original || typeof host.setLayoutRoot !== "function") {
				ctx.ui.notify("Title bar requires Pi's supported fullscreen layout.", "warning");
				return { render: () => [], invalidate() {} };
			}
			const refresh = () => tui.requestRender();
			const banner: Component = {
				render: (width) => {
					const cwd = ctx.sessionManager.getCwd();
					const home = homedir();
					const path = cwd === home ? "~" : cwd.startsWith(home + "/") ? "~" + cwd.slice(home.length) : cwd;
					const context = ctx.getContextUsage();
					const usage = context
						? `${context.tokens === null ? "?" : shortCount(context.tokens)} / ${shortCount(context.contextWindow)} - ${context.percent === null ? "?" : context.percent.toFixed(1)}%`
						: "";
					return renderTitleBanner(ctx.sessionManager.getSessionName(), width, theme, path, usage);
				},
				invalidate() {},
			};
			// layoutRoot is an internal Pi 1.0.4 field. Keep the original tree
			// intact so scrolling, focus, mouse geometry and the input dock survive.
			const root = new VStack([
				{ component: banner, basis: 2, grow: 0, shrink: 0, minSize: 2 },
				{ component: original, basis: 0, grow: 1, shrink: 1, minSize: 0 },
			]);
			host.setLayoutRoot(root);
			requestRender = refresh;
			let disposed = false;
			const dispose = () => {
				if (disposed) return;
				disposed = true;
				if (host.layoutRoot === root) host.setLayoutRoot?.(original);
				if (requestRender === refresh) requestRender = undefined;
				if (cleanup === dispose) cleanup = undefined;
				refresh();
			};
			cleanup = dispose;
			refresh();
			return { render: () => [], invalidate() {}, dispose };
		}, { placement: "aboveEditor" });
	});

	pi.on("session_info_changed", () => requestRender?.());
	pi.on("session_shutdown", (_event, ctx) => {
		cleanup?.();
		requestRender = undefined;
		if (ctx.mode === "tui") ctx.ui.setWidget(WIDGET_KEY, undefined);
	});
}

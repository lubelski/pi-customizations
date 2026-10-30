import { InteractiveMode, type ExtensionAPI, type Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { styleDivider } from "../lib/divider-style.ts";

// Pi has no widget-decoration API. Keep this private runtime seam confined to
// layout assembly so the widget retains its original input and disposal hooks.
type WidgetLayout = {
	renderWidgetContainer(container: { children: Component[] }, widgets: Map<string, Component>, spacerWhenEmpty: boolean, leadingSpacer: boolean): void;
};
const PATCH = Symbol.for("will.pi.subagent-divider.patch");
type Patch = { original: WidgetLayout["renderWidgetContainer"]; wrapper: WidgetLayout["renderWidgetContainer"] };

export function installDivider(target: WidgetLayout & { [PATCH]?: Patch }, getTheme: () => Theme | undefined): () => void {
	const previous = target[PATCH];
	const original = previous && target.renderWidgetContainer === previous.wrapper ? previous.original : target.renderWidgetContainer;
	if (typeof original !== "function") return () => {};
	const wrapper: WidgetLayout["renderWidgetContainer"] = function (this: WidgetLayout, container, widgets, spacerWhenEmpty, leadingSpacer) {
		original.call(this, container, widgets, spacerWhenEmpty, leadingSpacer);
		if (!leadingSpacer) return;
		const widget = widgets.get("subagent-async");
		const index = widget ? container.children.indexOf(widget) : -1;
		if (index < 0) return;
		container.children.splice(index, 0, {
			invalidate() {},
			render(width) {
				const theme = getTheme();
				return theme && width > 0 ? [styleDivider(theme, "─".repeat(width))] : [];
			},
		});
	};
	target.renderWidgetContainer = wrapper;
	target[PATCH] = { original, wrapper };
	return () => {
		if (target.renderWidgetContainer === wrapper) {
			target.renderWidgetContainer = original;
			delete target[PATCH];
		}
	};
}

export default function (pi: ExtensionAPI): void {
	let getTheme: () => Theme | undefined = () => undefined;
	const restore = installDivider(InteractiveMode.prototype as unknown as WidgetLayout, () => getTheme());
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode === "tui") getTheme = () => ctx.ui.theme;
	});
	pi.on("session_shutdown", () => { getTheme = () => undefined; restore(); });
}

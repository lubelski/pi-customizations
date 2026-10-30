import assert from "node:assert/strict";
import { test } from "node:test";
import { jiti, themeModule, tuiModule } from "./pi-runtime.ts";

test("subagent divider follows widget presence, theme, resize and reload without wrapping widget input", async () => {
	const { installDivider } = await jiti.import("../extensions/subagent-divider.ts");
	const { InteractiveMode } = await jiti.import("@earendil-works/pi-coding-agent");
	const target = { renderWidgetContainer: InteractiveMode.prototype.renderWidgetContainer };
	const original = target.renderWidgetContainer;
	let theme = themeModule.getThemeByName("dark");
	const container = new tuiModule.Container();
	const widget = new tuiModule.Text("async subagent · background", 0, 0);
	const widgets = new Map([["subagent-async", widget]]);
	const firstRestore = installDivider(target, () => theme);
	const restore = installDivider(target, () => theme);
	firstRestore();
	for (const name of ["dark", "light"]) {
		theme = themeModule.getThemeByName(name);
		target.renderWidgetContainer(container, widgets, true, true);
		assert.equal(container.children.filter(child => child === widget).length, 1);
		for (const width of [1, 20, 80, 140]) {
			const lines = container.render(width).map(tuiModule.stripTerminalSequences);
			assert.equal(lines.filter(line => line === "─".repeat(width)).length, 1);
			assert.equal(lines[1], "─".repeat(width));
		}
	}
	for (const entries of [new Map(), new Map([["other", widget]])]) {
		target.renderWidgetContainer(container, entries, true, true);
		assert.ok(!container.render(80).some(line => line.includes("─")));
	}
	target.renderWidgetContainer(container, widgets, false, false);
	assert.equal(container.children.length, 1);
	restore();
	assert.equal(target.renderWidgetContainer, original);
});

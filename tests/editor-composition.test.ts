import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { jiti, keybindingsModule, themeModule, tuiModule } from "./pi-runtime.ts";

const { default: stableInput } = await jiti.import("../extensions/stable-input-layout.ts");
const { default: nativeCursor } = await jiti.import("../extensions/native-cursor.ts");
const { renderTitleBanner } = await jiti.import("../extensions/session-title-banner.ts");
const { stripTerminalSequences, visibleWidth, CURSOR_MARKER } = tuiModule;

for (const extensions of [[stableInput], [nativeCursor, stableInput], [stableInput, nativeCursor]]) {
	test(`real EditorTheme: ${extensions.map((e) => e === stableInput ? "stable" : "cursor").join(" + ")}`, async () => {
		const handlers = new Map<string, Function[]>();
		const statuses = new Map<string, string>();
		const branchEntries = [];
		let footerLinksTool;
		const pi = {
			on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
			events: { on() {} },
			registerTool(tool) { footerLinksTool = tool; },
			appendEntry(customType, data) { branchEntries.push({ type: "custom", customType, data }); },
			getAllTools: () => [{ name: "mcp__linear__search", exposure: "codemode" }],
		};
		const tui = { terminal: { rows: 24, columns: 100 }, requestRender() {} };
		const keybindings = new keybindingsModule.KeybindingsManager();
		let factory;
		let footer;
		const ctx = {
			mode: "tui",
			sessionManager: {
				getCwd: () => "/project",
				getEntries: () => branchEntries,
				getBranch: () => branchEntries,
			},
			getContextUsage: () => ({ tokens: 29000, contextWindow: 272000, percent: 10.7 }),
			hasPendingMessages: () => false,
			isIdle: () => true,
			ui: {
				get theme() { return themeModule.theme; },
				getEditorComponent: () => factory,
				setEditorComponent(value) { factory = value; },
				setStatus(key, value) { statuses.set(key, value); },
				setFooter(value) {
					footer?.dispose?.();
					footer = value(tui, themeModule.theme, {
						onBranchChange: () => () => {},
						getGitBranch: () => "main",
						getExtensionStatuses: () => statuses,
					});
				},
			},
		};
		for (const extension of extensions) extension(pi);
		assert.equal(footerLinksTool.name, "set_footer_links");
		// Pi resets factories on reload, then dispatches session_start to all extensions.
		for (let reload = 0; reload < 2; reload++) {
			factory = undefined;
			for (const handler of handlers.get("session_start") ?? []) handler({}, ctx);
			const editorTheme = themeModule.getEditorTheme();
			assert.equal(editorTheme.colors, undefined, "do not pass a full Theme to the editor factory");
			const editor = factory(tui, editorTheme, keybindings);
			editor.focused = true;
			for (const theme of [
				themeModule.getThemeByName("dark"),
				themeModule.getThemeByName("light"),
				themeModule.loadThemeFromPath(resolve("themes/turquoise.json")),
			]) {
				themeModule.setThemeInstance(theme);
				for (const width of [12, 40, 100]) {
					editor.setText("日本語 input");
					// InteractiveMode changes this when the thinking level changes.
					editor.borderColor = (text) => theme.fg("thinkingHigh", text);
					const lines = editor.render(width);
					const divider = renderTitleBanner("Title", width, theme)[1];
					assert.equal(lines[0], divider);
					assert.equal(lines.at(-1), divider);
					for (const line of [...lines, ...footer.render(width)]) assert.ok(visibleWidth(line) <= width);
					if (extensions.includes(nativeCursor)) {
						assert.ok(lines.some((line) => line.includes(CURSOR_MARKER)));
						assert.ok(lines.every((line) => !line.includes("\x1b[7m")));
					}
				}
			}
			let footerLines = footer.render(100).map(stripTerminalSequences);
			assert.equal(footerLines.length, 7);
			assert.ok(footerLines[4].endsWith("MCP: linear"));
			assert.ok(footerLines[5].trimStart().startsWith("EXT:"));
			assert.ok(footerLines[4].startsWith(reload === 0 ? " " : "SPM-123 · Storybook"));
			assert.ok(footerLines[5].startsWith(" "), "EXT status should be right aligned");
			assert.equal(visibleWidth(footerLines[5]), 100);

			if (reload === 0) {
				await footerLinksTool.execute("footer-links", { links: [
					{ label: "SPM-123", url: "https://linear.app/mercury/issue/SPM-123" },
					{ label: "Storybook", url: "http://localhost:6006/?path=/story/budgets" },
				] });
				footerLines = footer.render(100).map(stripTerminalSequences);
				assert.ok(footerLines[4].startsWith("SPM-123 · Storybook"));
				assert.ok(footerLines[4].endsWith("MCP: linear"));
			}

			// Exercise real asynchronous autocomplete, including the dock swap.
			editor.setAutocompleteProvider({
				getSuggestions: () => ({ items: [{ value: "/hello", label: "/hello" }], prefix: "/h" }),
				applyCompletion: () => ({ lines: ["/hello"], cursorLine: 0, cursorCol: 6 }),
			});
			editor.setText("");
			editor.handleInput("/");
			await new Promise((resolve) => setTimeout(resolve, 150));
			assert.ok(editor.isShowingAutocomplete());
			editor.render(100);
			assert.deepEqual(footer.render(100), []);
			editor.handleInput("\x1b");
			editor.render(100);
			assert.equal(footer.render(100).length, 7);
		}
		footer.dispose();
	});
}

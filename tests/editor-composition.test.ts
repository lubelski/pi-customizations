import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { jiti, keybindingsModule, themeModule, tuiModule } from "./pi-runtime.ts";

const { default: stableInput, footerColumns, splitLine } = await jiti.import("../extensions/stable-input-layout.ts");
const { renderTitleBanner } = await jiti.import("../extensions/session-title-banner.ts");
const { stripTerminalSequences, visibleWidth, CURSOR_MARKER } = tuiModule;

test("footer columns reserve independent space at narrow and wide widths", () => {
	const theme = themeModule.getThemeByName("dark");
	for (const width of [0, 1, 2, 3, 12, 40, 99, 100, 160]) {
		const columns = footerColumns(width);
		assert.equal(columns.left + columns.right + columns.gap, width);
		const line = splitLine(theme, "LEFT ".repeat(50), "RIGHT ".repeat(50), width);
		assert.equal(visibleWidth(line), width);
		if (width >= 12) {
			const plain = stripTerminalSequences(line);
			assert.ok(plain.startsWith("LEFT"));
			assert.ok(plain.slice(columns.left + columns.gap).startsWith("RIGH"));
		}
		assert.equal(visibleWidth(splitLine(theme, "日本語", "🦀 extension", width)), width);
	}
});

for (const extensions of [[stableInput]]) {
	test("real EditorTheme: stable input preserves the native cursor marker", async () => {
		const handlers = new Map<string, Function[]>();
		const statuses = new Map<string, string>();
		const branchEntries = [];
		let footerLinksTool;
		const pi = {
			on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
			events: { on() {} },
			registerTool(tool) { if (tool.name === "set_footer_links") footerLinksTool = tool; },
			appendEntry(customType, data) { branchEntries.push({ type: "custom", customType, data }); },
			getAllTools: () => [
				{ name: "mcp__linear__search", exposure: "codemode" },
				{ name: "web_enable", sourceInfo: { path: "/web/index.js", source: "npm:pi-web-access@0.38.0", origin: "package" } },
				{ name: "journal_search", sourceInfo: { path: "/journal/dist/index.js", source: "../../dev/pi-agent-journal", origin: "package" } },
			],
			getActiveTools: () => ["web_enable", "journal_search"],
			getCommands: () => [],
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
					const divider = renderTitleBanner("Title", width, theme)[0];
					assert.equal(lines[0], divider);
					assert.equal(lines.at(-1), divider);
					for (const line of [...lines, ...footer.render(width)]) assert.ok(visibleWidth(line) <= width);
					// Pi 1.2 removes the software cursor at the TUI layer, not in Editor.render.
					assert.ok(lines.some((line) => line.includes(CURSOR_MARKER)));
				}
			}
			let footerLines = footer.render(100).map(stripTerminalSequences);
			assert.equal(footerLines.length, 7);
			assert.ok(footerLines[4].endsWith("MCP: linear"));
			assert.ok(footerLines[5].slice(51).trimStart().startsWith("EXT:"));
			assert.ok(footerLines[6].startsWith(reload === 0 ? " " : "SPM-123 · Storybook"));
			for (const [index, prefix] of ["F: /project", "B: main", "WT: -", "U: ", "C: ", "M: "].entries()) {
				assert.ok(footerLines[index].startsWith(prefix));
			}
			assert.equal(visibleWidth(footerLines[5]), 100);
			assert.ok(footerLines.slice(5).join(" ").includes("pi-web-access"));
			assert.ok(footerLines.slice(5).join(" ").includes("pi-agent-journal"));
			for (const line of footerLines.slice(5)) assert.equal(line.slice(49, 51), "  ");

			if (reload === 0) {
				await footerLinksTool.execute("footer-links", { links: [
					{ label: "SPM-123", url: "https://linear.app/mercury/issue/SPM-123" },
					{ label: "Storybook", url: "http://localhost:6006/?path=/story/budgets" },
				] });
				footerLines = footer.render(100).map(stripTerminalSequences);
				assert.ok(footerLines[6].startsWith("SPM-123 · Storybook"));
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

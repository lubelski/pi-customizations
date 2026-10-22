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
		let inventoryShortcut;
		let inventoryCommand;
		const pi = {
			on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
			events: { on() {} },
			registerTool(tool) { if (tool.name === "set_footer_links") footerLinksTool = tool; },
			registerShortcut(key, options) { assert.equal(key, "alt+i"); inventoryShortcut = options; },
			registerCommand(name, options) { assert.equal(name, "inventory"); inventoryCommand = options; },
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
			assert.equal(footerLines[6], "E: 1x MCP servers, 2x extensions (alt+i to expand)");
			assert.equal(footerLines[5].slice(51).trim(), reload === 0 ? "" : "SPM-123 · Storybook");
			assert.ok(footerLines.slice(3, 5).every((line) => line.slice(51).trim() === ""));
			for (const [index, prefix] of ["F: /project", "B: main", "WT: -", "U: ", "C: ", "M: "].entries()) {
				assert.ok(footerLines[index].startsWith(prefix));
			}
			assert.equal(visibleWidth(footerLines[5]), 100);
			await inventoryShortcut.handler();
			const expanded = footer.render(100).map(stripTerminalSequences);
			assert.equal(expanded.length, 10);
			assert.ok(expanded[6].endsWith("(alt+i to collapse)"));
			assert.deepEqual(expanded.slice(7), ["  MCP: linear", "  EXT: pi-agent-journal", "  EXT: pi-web-access"]);
			for (const width of [0, 1, 12, 40, 100]) {
				for (const line of footer.render(width)) assert.ok(visibleWidth(line) <= width);
			}
			await inventoryCommand.handler();
			assert.deepEqual(footer.render(100).map(stripTerminalSequences), footerLines);

			if (reload === 0) {
				await footerLinksTool.execute("footer-links", { links: [
					{ label: "SPM-123", url: "https://linear.app/mercury/issue/SPM-123" },
					{ label: "Storybook", url: "http://localhost:6006/?path=/story/budgets" },
				] });
				footerLines = footer.render(100).map(stripTerminalSequences);
				assert.ok(footerLines[5].endsWith("SPM-123 · Storybook"));
				assert.equal(footerLines.length, 7);
				const narrow = footer.render(24);
				const plain = narrow.map(stripTerminalSequences);
				assert.equal(plain.length, 7);
				assert.equal(plain[3].slice(13).trim(), "");
				assert.ok(plain[4].endsWith("SPM-123 ·"));
				assert.ok(plain[5].endsWith("Storybook"));
				assert.ok(narrow[4].includes("https://linear.app/mercury/issue/SPM-123"));
				assert.ok(narrow[5].includes("http://localhost:6006/?path=/story/budgets"));
				for (const width of [0, 1, 12, 24, 40, 100]) {
					for (const line of footer.render(width)) assert.ok(visibleWidth(line) <= width);
				}
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

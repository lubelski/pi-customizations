import assert from "node:assert/strict";
import test from "node:test";
import { jiti, themeModule, tuiModule } from "./pi-runtime.ts";

test("completed tools are one row, with native details and accurate mouse expansion", async () => {
	const { default: extension, toolSummary } = await jiti.import("../extensions/recessed-tools.ts");
	const { default: halfBleed } = await jiti.import("../extensions/half-bleed.ts");
	const { ToolExecutionComponent } = await jiti.import("@earendil-works/pi-coding-agent");
	const { stripTerminalSequences, visibleWidth, Text } = tuiModule;
	themeModule.initTheme("dark");
	const handlers = new Map();
	const pi = { on: (name, handler) => handlers.set(name, handler) };
	let renders = 0;
	const ui = { requestRender() { renders++; } };
	const ctx = { mode: "tui", ui: { get theme() { return themeModule.theme; }, setStatus() {} } };
	for (let reload = 0; reload < 3; reload++) {
		halfBleed(pi);
		extension(pi);
		handlers.get("session_start")({}, ctx);
		for (const definition of [undefined, { renderShell: "self", renderCall: () => new Text("native call", 0, 0), renderResult: () => new Text("native output", 0, 0) }]) {
			const tool = new ToolExecutionComponent("read", "id", { path: "/日本語/long-file.ts" }, {}, definition, ui);
			assert.ok(!stripTerminalSequences(tool.render(80)[0]).startsWith("›"), "pending tool stays native");
			const result = { content: [{ type: "text", text: "line one\nline two\nline three" }], details: undefined, isError: false };
			tool.updateResult(result, true);
			assert.ok(tool.render(80).length > 1, "partial output stays native");
			tool.updateResult(result, false);
			for (const width of [1, 4, 20, 80]) {
				const lines = tool.render(width);
				assert.equal(lines.length, 1);
				assert.ok(visibleWidth(lines[0]) <= width);
			}
			assert.equal(stripTerminalSequences(tool.render(80)[0]), "› read · /日本語/long-file.ts");
			assert.equal(tool.handleMouse({ type: "scroll", y: 0 }), undefined);
			assert.equal(tool.handleMouse({ type: "click", button: "left", y: 1 }), undefined);
			assert.deepEqual(tool.handleMouse({ type: "click", button: "left", y: 0 }), { handled: true });
			assert.ok(tool.render(80).length > 1);
			assert.match(tool.render(80).map(stripTerminalSequences).join("\n"), /native output|line three/);
			tool.setExpanded(false);
			assert.equal(tool.render(80).length, 1);
			tool.updateResult({ ...result, isError: true }, false);
			assert.match(stripTerminalSequences(tool.render(80)[0]), /^✗ read.*failed$/);
			// Image components must not bypass the summary path.
			tool.imageComponents = [{ render: () => ["image row", "image row"] }];
			assert.equal(tool.render(80).length, 1);
			assert.equal(result.content[0].text, "line one\nline two\nline three");
		}
	}
	assert.equal(renders, 6);
	assert.equal(toolSummary("codemode", { code: "secret script" }, false), "› codemode");
	assert.equal(toolSummary("bash", { command: "echo\n\u001b[31mhello\tworld" }, false), "› bash · echo hello world");
	assert.equal(toolSummary("mcp__server__tool", {}, false), "› mcp__server__tool");
});

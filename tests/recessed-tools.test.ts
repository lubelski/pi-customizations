import assert from "node:assert/strict";
import test from "node:test";
import { jiti, themeModule, tuiModule } from "./pi-runtime.ts";

test("completed tools are one row, with native details and accurate mouse expansion", async () => {
	const { default: extension, toolSummary, codemodeCalls } = await jiti.import("../extensions/recessed-tools.ts");
	const { default: halfBleed } = await jiti.import("../extensions/half-bleed.ts");
	const { ToolExecutionComponent } = await jiti.import("@earendil-works/pi-coding-agent");
	const { stripTerminalSequences, visibleWidth, Text } = tuiModule;
	themeModule.initTheme("dark");
	const handlers = new Map();
	const commands = new Map();
	const pi = { on: (name, handler) => handlers.set(name, handler), registerCommand: (name, command) => commands.set(name, command) };
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
	const long = new ToolExecutionComponent("bash", "long", { command: "test" }, {}, undefined, ui);
	long.updateResult({ content: [{ type: "text", text: Array.from({ length: 100 }, (_, i) => `output ${i}`).join("\n") }] }, false);
	long.setExpanded(true); // Native Ctrl+O path is bounded too.
	let lines = long.render(80);
	assert.equal(lines.length, 12);
	assert.match(stripTerminalSequences(lines.at(-1)), /10 more.*show all/);
	assert.equal(long.handleMouse({ type: "click", button: "left", x: 0, y: 3 }), undefined);
	long.handleMouse({ type: "click", button: "left", x: 0, y: 11 });
	lines = long.render(80);
	assert.equal(lines.length, 22);
	await commands.get("tool-detail").handler("more", ctx);
	assert.equal(long.render(80).length, 32);
	long.handleMouse({ type: "click", button: "left", x: 40, y: 31 });
	assert.ok(long.render(80).length > 100);
	assert.match(long.render(80).map(stripTerminalSequences).join("\n"), /output 99/);
	long.handleMouse({ type: "click", button: "left", x: 0, y: 0 });
	assert.equal(long.render(80).length, 1);
	long.setExpanded(true);
	assert.equal(long.render(80).length, 12, "reopening resets the preview budget");
	for (const width of [1, 4, 20]) {
		assert.equal(long.render(width).length, 12);
		assert.ok(long.render(width).every(line => visibleWidth(line) <= width));
	}
	await commands.get("tool-detail").handler("collapse", ctx);
	assert.equal(long.render(80).length, 1);
	// Preview never executes image renderers, even after native expansion.
	long.imageComponents = [{ render() { assert.fail("image rendered in preview"); } }];
	long.setExpanded(true);
	assert.equal(long.render(80).length, 12);
	assert.equal(toolSummary("codemode", { code: "secret script" }, false), "› codemode");
	assert.deepEqual(codemodeCalls(`// tools.fake()
		const example = 'tools.fake()'; const regex = /tools.fake()/;
		await tools.read({}); await tools["read"]({});
		await Promise.all([tools.bash({}), tools.edit({}), tools.write({})]);
		await searchTools("x"); await describeTool("read"); await describeNamespace("ns");
		return tools[name]({});`), ["read ×2", "bash", "edit", "write", "searchTools", "describeTool", "describeNamespace"]);
	assert.deepEqual(codemodeCalls('return `tools.fake() ${await tools.read({})}`'), ["read"]);
	assert.deepEqual(codemodeCalls('tools[name]({}); const r = tools.read; other.tools.fake();'), []);
	assert.deepEqual(codemodeCalls('tools.read('), []);
	assert.deepEqual(codemodeCalls(undefined), []);
	assert.deepEqual(codemodeCalls(' '.repeat(100_001)), []);
	const scriptArgs = { code: 'tools.read({}); tools.read({}); tools.bash({}); tools.edit({}); tools.write({})' };
	assert.equal(toolSummary("codemode", scriptArgs, false), "› codemode · read ×2, bash, edit · +1 more");
	assert.equal(toolSummary("codemode", scriptArgs, false, 34), "› codemode · read ×2 · +3 more");
	scriptArgs.code = 'await describeTool("read")';
	assert.equal(toolSummary("codemode", scriptArgs, true), "✗ codemode · describeTool · failed");
	const codeTool = new ToolExecutionComponent("codemode", "code", scriptArgs, {}, undefined, ui);
	codeTool.updateResult({ content: [{ type: "text", text: "done" }] }, false);
	for (const width of [1, 12, 30, 80]) {
		const rendered = codeTool.render(width);
		assert.equal(rendered.length, 1);
		assert.ok(visibleWidth(rendered[0]) <= width);
	}
	assert.match(stripTerminalSequences(codeTool.render(80)[0]), /codemode · describeTool/);
	assert.equal(toolSummary("bash", { command: "echo\n\u001b[31mhello\tworld" }, false), "› bash · echo hello world");
	assert.equal(toolSummary("mcp__server__tool", {}, false), "› mcp__server__tool");
});

import assert from "node:assert/strict";
import test from "node:test";
import { jiti, tuiModule, themeModule } from "./pi-runtime.ts";

test("fenced code uses matching bracket arms and retains native syntax colors", async () => {
	const { default: extension } = await jiti.import("../extensions/code-brackets.ts");
	const { Markdown, stripTerminalSequences, visibleWidth } = tuiModule;
	const { getMarkdownTheme } = await jiti.import("@earendil-works/pi-coding-agent");
	const pi = { on() {} };
	const source = "Before `inline`.\n\n```typescript\nconst answer = 42;\nconsole.log(answer);\n```\n\nAfter.";
	for (const theme of ["dark", "light"]) {
		themeModule.initTheme(theme);
		const markdownTheme = getMarkdownTheme();
		for (let reload = 0; reload < 3; reload++) {
			extension(pi);
			const render = (text, width = 80) => new Markdown(text, 0, 0, markdownTheme).render(width);
			const lines = render(source);
			const plain = lines.map(line => stripTerminalSequences(line).trimEnd());
			assert.ok(plain.includes("┌typescript─"));
			assert.ok(plain.includes("└───────────"));
			assert.ok(plain.includes("│ const answer = 42;"));
			assert.ok(plain.includes("Before inline."));
			assert.ok(plain.includes("After."));
			assert.ok(!plain.some(line => line.includes("```")));
			const highlighted = markdownTheme.highlightCode("const answer = 42;", "typescript")[0];
			assert.ok(lines.some(line => line.includes(highlighted)), "native highlighting is preserved");
			assert.ok(render("```\nx\n```").map(stripTerminalSequences).some(line => line.trimEnd() === "┌"));
			assert.ok(render("~~~js\nx\n~~~").map(stripTerminalSequences).some(line => line.trimEnd() === "┌js─"));
			// Literal fence characters inside code are content, not decoration.
			assert.ok(render('````text\n```\n````').map(stripTerminalSequences).some(line => line.includes("│ ```")));
			assert.ok(render("```js\nconst x = 1;").map(stripTerminalSequences).some(line => line.includes("┌js─")), "streaming/unclosed fence");
			for (const width of [1, 2, 3, 8, 20, 80]) {
				const narrow = render("```typescript\nlong_identifier_" + "x".repeat(100) + "\n```", width);
				assert.ok(narrow.every(line => visibleWidth(line) <= width), `width ${width}`);
				const p = narrow.map(line => stripTerminalSequences(line).trimEnd());
				assert.equal(visibleWidth(p[0]), visibleWidth(p.at(-1)));
				if (width >= 3) assert.ok(p.slice(1, -1).every(line => line.startsWith("│ ")));
			}
			const wideLabel = render("```日本語\nx\n\n y\n```").map(line => stripTerminalSequences(line).trimEnd());
			assert.equal(visibleWidth(wideLabel[0]), visibleWidth(wideLabel.at(-1)));
			assert.ok(wideLabel.includes("│"), "blank code rows retain their rule");
			assert.ok(!render("    indented code").map(stripTerminalSequences).join("\n").includes("┌"));
			for (const nested of ["> ```js\n> let x = 1;\n> ```", "- item\n\n  ```js\n  let x = 1;\n  ```"]) {
				assert.match(render(nested).map(stripTerminalSequences).join("\n"), /┌js─/);
			}
		}
	}
});

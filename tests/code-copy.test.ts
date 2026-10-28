import assert from "node:assert/strict";
import test from "node:test";
import { jiti, tuiModule, themeModule } from "./pi-runtime.ts";

test("divider clicks copy original blocks across wrapping, nesting, caching, resize and reload", async () => {
 const { default: extension } = await jiti.import("../extensions/code-brackets.ts");
 const { installCodeCopy } = await jiti.import("../lib/code-copy.ts");
 const { attachMessageRendering } = await jiti.import("../lib/message-controls.ts");
 const { getMarkdownTheme } = await jiti.import("@earendil-works/pi-coding-agent");
 const { Markdown, stripTerminalSequences } = tuiModule;
 themeModule.initTheme("dark");
 extension({ on() {} });
 const copied = [];
 const notices = [];
 for (let reload = 0; reload < 3; reload++) {
  installCodeCopy(Markdown.prototype, async text => { copied.push(text); }, message => notices.push(message));
  for (const [source, expected] of [
   ["```ts\n\tconst 界 = 1;\n\nlong_long_long_long_line\n```", "\tconst 界 = 1;\n\nlong_long_long_long_line"],
   ["> ```js\n> x();\n> ```", "x();"],
   ["- item\n\n  ```js\n  nested();\n  ```", "nested();"],
   ["    indented\n\n```\nsecond\n```", "second"],
   ["```\nfirst\n```\n\n```\nsecond\n```", "second"],
   ["```js\nstreaming", "streaming"],
  ]) {
   const block = new Markdown(source, 1, 1, getMarkdownTheme());
   const mode = { plain: false };
   attachMessageRendering(block, mode);
   for (const width of [40, 12, 40, 40]) {
    const lines = block.render(width);
    assert.ok(lines.every(line => !line.includes("pi-code")), "metadata never reaches terminal");
    const plain = lines.map(stripTerminalSequences);
    const y = plain.findLastIndex(line => line.includes("│") && !line.includes("└") && !line.includes("┌"));
    const x = plain[y].lastIndexOf("│");
    const event = { type: "click", button: "left", x, y, width, height: lines.length, screenX: x, screenY: y, shift: false, alt: false, ctrl: false };
    assert.equal(block.handleMouse(event)?.handled, true, source);
    await Promise.resolve();
    assert.equal(copied.at(-1), expected);
    for (const change of [{ x: x + 1 }, { type: "drag" }, { type: "wheel" }, { button: "right" }, { shift: true }]) {
     assert.equal(block.handleMouse({ ...event, ...change }), undefined);
    }
    mode.plain = true;
    block.render(width);
    assert.equal(block.handleMouse(event), undefined);
    mode.plain = false;
   }
   block.setText("no code now");
   block.render(40);
   assert.equal(block.handleMouse({ type: "click", button: "left", x: 1, y: 2 }), undefined);
  }
 }
 assert.ok(notices.includes("Copied"));
 installCodeCopy(Markdown.prototype, async () => { throw new Error("clipboard unavailable"); }, message => notices.push(message));
 const block = new Markdown("```\nx\n```", 0, 0, getMarkdownTheme());
 block.render(20);
 block.handleMouse({ type: "click", button: "left", x: 0, y: 1 });
 await Promise.resolve();
 assert.equal(notices.at(-1), "Could not copy code");
});

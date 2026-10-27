import assert from "node:assert/strict";
import test from "node:test";
import { jiti, tuiModule } from "./pi-runtime.ts";

test("global plain rendering preserves literal fences, dividers, and native mouse handling", async () => {
 const { attachMessageRendering, codeBlocks } = await jiti.import("../lib/message-controls.ts");
 const source = "Before\n\n```ts\n  const x = 1;\n```";
 assert.deepEqual(codeBlocks(source), ["  const x = 1;"]);
 assert.deepEqual(codeBlocks("> ~~~js\n> x\n> ~~~"), ["x"]);
 const state = { plain: false };
 const mouse = () => undefined;
 const blocks = [source, "Other **message**"].map(text => ({ text, render: width => ["decorated".slice(0, width)], handleMouse: mouse }));
 for (const block of blocks) attachMessageRendering(block, state);
 assert.equal(blocks[0].render(80)[0], "decorated");
 state.plain = true;
 for (const block of blocks) {
  assert.equal(block.handleMouse, mouse);
  const lines = block.render(80).map(tuiModule.stripTerminalSequences);
  assert.equal(lines[0], "─".repeat(80));
  assert.equal(lines.at(-1), lines[0]);
  assert.equal(lines.slice(1, -1).map(line => line.trimEnd()).join("\n"), block.text);
  for (const width of [0, 1, 2, 10, 30, 80]) {
   assert.ok(block.render(width).every(line => tuiModule.visibleWidth(line) <= width));
  }
 }
 blocks[0].text = "Updated\n```js\nx();\n```";
 assert.match(blocks[0].render(80).join("\n"), /```js/);
 state.plain = false;
 assert.equal(blocks[0].render(80)[0], "decorated");
});

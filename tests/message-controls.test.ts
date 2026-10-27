import assert from "node:assert/strict";
import test from "node:test";
import { jiti, tuiModule } from "./pi-runtime.ts";

test("message controls toggle raw text without consuming body selection", async () => {
 const { attachMessageControls, codeBlocks } = await jiti.import("../lib/message-controls.ts");
 const { stripTerminalSequences, visibleWidth } = tuiModule;
 const source = "Before\n\n```ts\n  const x = 1;\n```";
 assert.deepEqual(codeBlocks(source), ["  const x = 1;"]);
 assert.deepEqual(codeBlocks("> ~~~js\n> x\n> ~~~"), ["x"]);
 const state = { plain: false };
 const block = { text: source, render: width => [" ".repeat(width), "decorated"] };
 attachMessageControls(block, state, () => {});
 let lines = block.render(80);
 assert.match(lines[0], /\[plain text\] \[copy code\]/);
 assert.equal(block.handleMouse({ type: "click", button: "left", x: 60, y: 1 }), undefined);
 assert.equal(block.handleMouse({ type: "drag", button: "left", x: 55, y: 0 }), undefined);
 assert.deepEqual(block.handleMouse({ type: "click", button: "left", x: 55, y: 0 }), { handled: true });
 assert.equal(state.plain, true);
 lines = block.render(80).map(stripTerminalSequences);
 assert.match(lines[0], /\[formatted\]/);
 assert.ok(lines.some(line => line.trimEnd() === "  const x = 1;"));
 assert.ok(lines.some(line => line.trimEnd() === "```ts"));
 assert.ok(!lines.join("\n").includes("decorated"));
 for (const width of [1, 10, 30, 80]) {
  assert.ok(block.render(width).every(line => visibleWidth(line) <= width));
 }
});

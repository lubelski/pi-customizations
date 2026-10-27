import assert from "node:assert/strict";
import test from "node:test";
import { jiti, tuiModule } from "./pi-runtime.ts";

test("copy is available for prose and copies the complete source in either format", async () => {
 const { attachMessageControls } = await jiti.import("../lib/message-controls.ts");
 for (const source of ["A **bold** paragraph.", "Prose\n\n```ts\nconst x = 1;\n```\n\nMore prose."]) {
  const copied: string[] = [];
  const state = { plain: false, expanded: true };
  const block = { text: source, render: width => [" ".repeat(width), "decorated"] };
  attachMessageControls(block, state, () => {}, text => text, async text => { copied.push(text); });
  for (const plain of [false, true]) {
   state.plain = plain;
   const top = tuiModule.stripTerminalSequences(block.render(80)[0]);
   assert.deepEqual(block.handleMouse({ type: "click", button: "left", x: top.indexOf("copy"), y: 0 }), { handled: true });
   assert.equal(copied.at(-1), source);
  }
 }
});

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
 const closedTop = stripTerminalSequences(lines[0]);
 assert.match(closedTop, /‹/);
 assert.doesNotMatch(closedTop, /fmt|copy/);
 assert.deepEqual(block.handleMouse({ type: "click", button: "left", x: closedTop.indexOf("‹"), y: 0 }), { handled: true });
 lines = block.render(80);
 assert.match(stripTerminalSequences(lines[0]), / fmt    copy /);
 assert.equal(block.handleMouse({ type: "click", button: "left", x: 60, y: 1 }), undefined);
 assert.equal(block.handleMouse({ type: "drag", button: "left", x: 55, y: 0 }), undefined);
 const fmtX = stripTerminalSequences(lines[0]).indexOf("fmt");
 assert.equal(block.handleMouse({ type: "click", button: "left", x: fmtX - 1, y: 0 }), undefined);
 for (const x of [fmtX + 4, fmtX + 5, 78, 79]) {
  assert.equal(block.handleMouse({ type: "click", button: "left", x, y: 0 }), undefined);
 }
 assert.deepEqual(block.handleMouse({ type: "click", button: "left", x: fmtX, y: 0 }), { handled: true });
 assert.equal(state.plain, true);
 lines = block.render(80).map(stripTerminalSequences);
 assert.match(lines[0], /fmt/);
 assert.ok(lines.some(line => line.trimEnd() === "  const x = 1;"));
 assert.ok(lines.some(line => line.trimEnd() === "```ts"));
 assert.ok(!lines.join("\n").includes("decorated"));
 const openTop = stripTerminalSequences(block.render(80)[0]);
 block.handleMouse({ type: "click", button: "left", x: openTop.indexOf("›"), y: 0 });
 const closedAgain = stripTerminalSequences(block.render(80)[0]);
 assert.match(closedAgain, /‹/);
 assert.doesNotMatch(closedAgain, /fmt|copy/);
 assert.equal(state.plain, true);
 for (const width of [1, 10, 30, 80]) {
  assert.ok(block.render(width).every(line => visibleWidth(line) <= width));
 }
});

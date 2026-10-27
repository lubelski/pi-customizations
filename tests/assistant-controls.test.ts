import assert from "node:assert/strict";
import test from "node:test";
import { jiti, tuiModule, themeModule } from "./pi-runtime.ts";

test("assistant controls survive invalidation and preserve native error rows", async () => {
 const { default: extension } = await jiti.import("../extensions/assistant-background.ts");
 const { AssistantMessageComponent } = await jiti.import("@earendil-works/pi-coding-agent");
 themeModule.initTheme("dark");
 const commands = new Map();
 const events = new Map();
 extension({ on(name, handler) { events.set(name, handler); }, registerCommand(name, value) { commands.set(name, value); } });
 events.get("session_start")({}, { mode: "tui", ui: { theme: themeModule.theme, setStatus() {}, notify() {} } });
 const component = new AssistantMessageComponent({ content: [{ type: "text", text: "First paragraph\n\nSecond paragraph\n\n```js\n  x();\n```" }], stopReason: "length" });
 const plain = () => component.render(80).map(tuiModule.stripTerminalSequences).join("\n");
 assert.match(plain(), /‹/);
 assert.doesNotMatch(plain(), /fmt|copy/);
 const initialRows = component.render(80).map(tuiModule.stripTerminalSequences);
 const triggerY = initialRows.findIndex(line => line.includes("‹"));
 const triggerX = tuiModule.visibleWidth(initialRows[triggerY].slice(0, initialRows[triggerY].indexOf("‹")));
 assert.ok(component.handleMouse({ type: "click", button: "left", x: triggerX, y: triggerY, width: 80, height: initialRows.length, screenX: triggerX, screenY: triggerY })?.handled);
 const formatted = component.render(80);
 const top = formatted.find(line => line.includes("fmt"));
 assert.match(tuiModule.stripTerminalSequences(top), /^🬞🬭+ fmt 🬭🬭 copy 🬭🬭 › 🬭🬏$/u);
 assert.ok(top.includes(themeModule.theme.fg("mdCodeBlockBorder", " fmt ")));
 assert.ok(top.includes(themeModule.theme.fg("mdCodeBlockBorder", " copy ")));
 assert.match(top, /\x1b\[48;[^m]+m/);
 const rows = formatted.map(tuiModule.stripTerminalSequences);
 assert.equal(rows.filter(line => line.startsWith("🬞")).length, 1);
 assert.equal(rows.filter(line => line.startsWith("🬁")).length, 1);
 assert.ok(rows.some(line => /^▐ +▌$/u.test(line)), "paragraph gaps stay blank");
 for (const width of [10, 30, 80]) {
  assert.ok(component.render(width).every(line => tuiModule.visibleWidth(line) <= width));
 }
 await commands.get("plain-text").handler("", { ui: { notify() {} } });
 component.invalidate();
 assert.match(plain(), /```js/);
 assert.match(plain(), /  x\(\);/);
 assert.match(plain(), /Response was truncated/);
 assert.doesNotMatch(plain(), /🬞/);
 const plainTop = component.render(80).find(line => line.includes("fmt"));
 assert.ok(plainTop.includes(themeModule.theme.fg("mdCodeBlockBorder", "fmt")));
 assert.ok(plainTop.includes(themeModule.theme.fg("mdCodeBlockBorder", "copy")));
 assert.match(tuiModule.stripTerminalSequences(plainTop), /fmt  copy  ›  $/);
 assert.doesNotMatch(plainTop, /\x1b\[48;/);
 assert.match(plain(), /fmt/);
 await commands.get("plain-text").handler("", { ui: { notify() {} } });
 assert.match(plain(), /fmt/);
 assert.match(plain(), /🬞/);
});

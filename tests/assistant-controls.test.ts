import assert from "node:assert/strict";
import test from "node:test";
import { jiti, tuiModule, themeModule } from "./pi-runtime.ts";

test("plain-text toggles existing and future assistant messages without controls", async () => {
 const { default: extension } = await jiti.import("../extensions/assistant-background.ts");
 const { AssistantMessageComponent } = await jiti.import("@earendil-works/pi-coding-agent");
 themeModule.initTheme("dark");
 const commands = new Map();
 const events = new Map();
 extension({ on(name, handler) { events.set(name, handler); }, registerCommand(name, value) { commands.set(name, value); } });
 const ctx = { mode: "tui", ui: { theme: themeModule.theme, setStatus() {}, notify() {} } };
 events.get("session_start")({}, ctx);
 const create = () => new AssistantMessageComponent({ content: [{ type: "text", text: "First **paragraph**\n\nSecond paragraph\n\n```js\n  x();\n```" }], stopReason: "length" });
 const components = [create(), create()];
 const rows = component => component.render(80).map(tuiModule.stripTerminalSequences);
 for (const component of components) {
  const formatted = rows(component);
  assert.equal(formatted.filter(line => line.startsWith("🬞")).length, 1);
  assert.equal(formatted.filter(line => line.startsWith("🬁")).length, 1);
  assert.doesNotMatch(formatted.join("\n"), /‹|›|fmt|copy/);
 }
 await commands.get("plain-text").handler("", ctx);
 components.push(create());
 for (const component of components) {
  component.invalidate();
  const plain = rows(component).join("\n");
  assert.match(plain, /First \*\*paragraph\*\*/);
  assert.match(plain, /```js/);
  assert.match(plain, /  x\(\);/);
  assert.match(plain, /Response was truncated/);
  assert.doesNotMatch(plain, /🬞|▐|‹|›/);
  assert.equal(rows(component).filter(line => line === "─".repeat(80)).length, 2);
  for (const width of [10, 30, 80]) assert.ok(component.render(width).every(line => tuiModule.visibleWidth(line) <= width));
 }
 await commands.get("plain-text").handler("", ctx);
 for (const component of components) assert.match(rows(component).join("\n"), /🬞/);
 // Toggling before a first message also applies to newly rendered messages.
 events.get("session_start")({}, ctx);
 await commands.get("plain-text").handler("", ctx);
 assert.match(rows(create()).join("\n"), /```js/);
});

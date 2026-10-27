import assert from "node:assert/strict";
import test from "node:test";
import { jiti, tuiModule, themeModule } from "./pi-runtime.ts";

test("assistant controls survive invalidation and preserve native error rows", async () => {
 const { default: extension } = await jiti.import("../extensions/assistant-background.ts");
 const { AssistantMessageComponent } = await jiti.import("@earendil-works/pi-coding-agent");
 themeModule.initTheme("dark");
 const commands = new Map();
 extension({ on() {}, registerCommand(name, value) { commands.set(name, value); } });
 const component = new AssistantMessageComponent({ content: [{ type: "text", text: "```js\n  x();\n```" }], stopReason: "length" });
 const plain = () => component.render(80).map(tuiModule.stripTerminalSequences).join("\n");
 assert.match(plain(), /\[plain text\]/);
 await commands.get("plain-text").handler("", { ui: { notify() {} } });
 component.invalidate();
 assert.match(plain(), /```js/);
 assert.match(plain(), /  x\(\);/);
 assert.match(plain(), /Response was truncated/);
 assert.match(plain(), /\[formatted\]/);
 await commands.get("plain-text").handler("", { ui: { notify() {} } });
 assert.match(plain(), /\[plain text\]/);
});

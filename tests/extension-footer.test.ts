import assert from "node:assert/strict";
import test from "node:test";
import { extensionNamesFromRuntime } from "../lib/extension-footer.ts";

const source = (name: string) => ({ path: `/packages/${name}/dist/index.js`, source: `npm:${name}@1.2.3`, origin: "package" });
const file = (name: string) => ({ path: `/extensions/${name}.ts`, source: "auto", origin: "top-level" });

test("groups tool and command providers by package, including future packages", () => {
	assert.deepEqual(extensionNamesFromRuntime([
		{ name: "web_enable", sourceInfo: source("pi-web-access") },
		{ name: "web_search", sourceInfo: source("pi-web-access") },
		{ name: "journal_search", sourceInfo: { ...source("journal"), source: "../../dev/pi-agent-journal" } },
		{ name: "future", exposure: "codemode", sourceInfo: source("@org/future") },
	], ["web_enable", "journal_search"], [
		{ source: "extension", sourceInfo: source("pi-web-access") },
		{ source: "extension", sourceInfo: file("session-rename") },
	], new Map()), ["@org/future", "pi-agent-journal", "pi-web-access", "session-rename"]);
});

test("omits builtins, MCP, inactive direct tools, hidden tools, skills and prompts", () => {
	assert.deepEqual(extensionNamesFromRuntime([
		{ name: "read", sourceInfo: { path: "builtin:read", source: "builtin", origin: "top-level" } },
		{ name: "mcp__linear__search", exposure: "codemode", sourceInfo: source("mcp") },
		{ name: "search", namespace: { name: "mcp__balsamiq" }, exposure: "deferred", sourceInfo: source("mcp") },
		{ name: "inactive", sourceInfo: source("inactive") },
		{ name: "hidden", exposure: "hidden", sourceInfo: source("hidden") },
		{ name: "unknown" },
	], ["read", "hidden", "unknown"], [
		{ source: "skill", sourceInfo: source("skill") },
		{ source: "prompt", sourceInfo: source("prompt") },
	], new Map()), []);
});

test("includes indirect tools and status-only UI, deduplicating friendly status labels", () => {
	assert.deepEqual(extensionNamesFromRuntime([
		{ name: "later", exposure: "deferred", sourceInfo: source("later") },
		{ name: "ui_tool", sourceInfo: file("assistant-background") },
	], ["ui_tool"], [], new Map([
		["pi-customization:assistant-background", "assistant-bg"],
		["pi-customization:native-cursor", "native-cursor"],
		["unrelated", "working"],
	])), ["later", "assistant-bg", "native-cursor"]);
});

test("pi-customizations sorts after other providers regardless of alphabetic order", () => {
	assert.deepEqual(extensionNamesFromRuntime([
		{ name: "footer", exposure: "codemode", sourceInfo: source("pi-customizations") },
		{ name: "z", exposure: "codemode", sourceInfo: source("zebra") },
		{ name: "local", exposure: "codemode", sourceInfo: { ...file("stable-input-layout"), path: "/dev/pi-customizations/extensions/stable-input-layout.ts" } },
	], [], [], new Map()), ["zebra", "pi-customizations", "stable-input-layout"]);
});

test("fresh snapshots reflect tool activation and withdrawal without stale entries", () => {
	const tools = [{ name: "future", sourceInfo: source("future") }];
	assert.deepEqual(extensionNamesFromRuntime(tools, [], [], new Map()), []);
	assert.deepEqual(extensionNamesFromRuntime(tools, ["future"], [], new Map()), ["future"]);
	assert.deepEqual(extensionNamesFromRuntime([{ ...tools[0], exposure: "hidden" }], ["future"], [], new Map()), []);
});

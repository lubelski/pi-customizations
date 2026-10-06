import assert from "node:assert/strict";
import test from "node:test";
import { mcpServerNamesFromTools } from "../lib/mcp-footer.ts";

test("native direct and indirect tools yield unique server names", () => {
	assert.deepEqual(mcpServerNamesFromTools([
		{ name: "mcp__linear__search", exposure: "codemode", namespace: { name: "mcp__linear" } },
		{ name: "mcp__linear__get", exposure: "deferred" },
		{ name: "mcp__balsamiq__edit", exposure: "direct" },
		{ name: "read" },
	]), ["balsamiq", "linear"]);
});

test("namespace preserves server names and disambiguates underscores", () => {
	assert.deepEqual(mcpServerNamesFromTools([
		{ name: "mcp__dev_radius__get", namespace: { name: "mcp__dev-radius" } },
		{ name: "mcp__my_server__get_item" },
		{ name: "mcp___private__get" },
	]), ["_private", "dev-radius", "my_server"]);
});

test("hidden tools are omitted, including withdrawn server tools", () => {
	assert.deepEqual(mcpServerNamesFromTools([
		{ name: "mcp__old__get", exposure: "hidden", namespace: { name: "mcp__old" } },
	]), []);
	assert.deepEqual(mcpServerNamesFromTools([]), []);
});

test("legacy adapter namespace tools remain supported", () => {
	assert.deepEqual(mcpServerNamesFromTools([{ name: "mcp__linear" }]), ["linear"]);
});

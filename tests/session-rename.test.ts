import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	DEFAULT_RENAME_CONFIG,
	DEFAULT_RENAME_MODEL,
	buildConversationText,
	extractSessionName,
	getRenameArgumentCompletions,
	isNamingDue,
	loadRenameConfig,
	parseModelRef,
	parseRenameCommand,
	parseRenameConfig,
	resolveThinkingLevel,
	sanitizeName,
	saveRenameConfig,
	shouldApplyAutoName,
	stripQuotes,
} from "../lib/session-rename.ts";

test("conversation text keeps user intent and drops assistant output", () => {
	const conversation = buildConversationText([
		{
			type: "message",
			message: { role: "user", content: [{ type: "text", text: "Port session naming" }] },
		},
		{
			type: "message",
			message: { role: "assistant", content: [{ type: "text", text: "Working on it" }] },
		},
	]);
	assert.equal(conversation, "User: Port session naming");
});

test("generated names are extracted as short topics", () => {
	assert.equal(
		extractSessionName("<session_name>Configurable session title formatting</session_name>"),
		"Configurable session title formatting",
	);
	assert.equal(extractSessionName("untagged title"), undefined);
	assert.equal(extractSessionName("<session_name> </session_name>"), undefined);

	const words = Array.from({ length: 14 }, (_, index) => `word${index + 1}`);
	assert.equal(
		extractSessionName(`<session_name>${words.join(" ")}</session_name>`),
		words.slice(0, 10).join(" "),
	);
});

test("name sanitization keeps one normalized line", () => {
	assert.equal(sanitizeName("  Session   rename port\nextra explanation"), "Session rename port");
	assert.equal(sanitizeName(" "), undefined);
});

test("rename command supports generation, settings, and manual names", () => {
	assert.deepEqual(parseRenameCommand(""), { kind: "generate" });
	assert.deepEqual(parseRenameCommand("settings"), { kind: "settings" });
	assert.deepEqual(parseRenameCommand('"Manual topic"'), {
		kind: "set-name",
		name: "Manual topic",
	});
	assert.deepEqual(parseRenameCommand('"settings"'), {
		kind: "set-name",
		name: "settings",
	});
	assert.equal(stripQuotes("'Topic'"), "Topic");
	assert.equal(getRenameArgumentCompletions("set")?.[0]?.value, "settings");
	assert.equal(getRenameArgumentCompletions("release"), null);
});

test("model references require provider and model", () => {
	assert.deepEqual(parseModelRef(" openai/gpt-5.6-sol "), {
		provider: "openai",
		id: "gpt-5.6-sol",
	});
	assert.equal(parseModelRef("gpt-5.6-sol"), null);
	assert.equal(parseModelRef("/gpt-5.6-sol"), null);
	assert.equal(parseModelRef("openai/"), null);
});

test("thinking levels preserve supported values and disable off", () => {
	assert.equal(resolveThinkingLevel("low"), "low");
	assert.equal(resolveThinkingLevel(" max "), "max");
	assert.equal(resolveThinkingLevel("off"), undefined);
	assert.equal(resolveThinkingLevel("ultra"), undefined);
});

test("automatic naming follows the configured cadence", () => {
	assert.equal(isNamingDue(1, 1, 5), true);
	assert.equal(isNamingDue(5, 1, 5), false);
	assert.equal(isNamingDue(6, 1, 5), true);
	assert.equal(isNamingDue(6, 1, 0), false);
	assert.equal(isNamingDue(10, 0, 5), false);
});

test("pending automatic names do not overwrite newer manual state", () => {
	assert.equal(shouldApplyAutoName(1, 1, undefined, false), true);
	assert.equal(shouldApplyAutoName(1, 2, undefined, false), false);
	assert.equal(shouldApplyAutoName(1, 1, "Manual topic", false), false);
	assert.equal(shouldApplyAutoName(1, 1, "Previous generated topic", true), true);
});

test("rename config validates values over defaults", () => {
	assert.equal(DEFAULT_RENAME_MODEL, "openai-codex/gpt-5.6-luna");
	assert.deepEqual(parseRenameConfig({}).value, DEFAULT_RENAME_CONFIG);

	const { value, warnings } = parseRenameConfig({
		afterSteps: 2.8,
		everySteps: 0,
		model: " openai/gpt-5.6-sol ",
		thinkingLevel: "high",
	});
	assert.deepEqual(value, {
		afterSteps: 2,
		everySteps: 0,
		model: "openai/gpt-5.6-sol",
		thinkingLevel: "high",
	});
	assert.deepEqual(warnings, []);

	const invalid = parseRenameConfig({ afterSteps: -1, model: 42, thinkingLevel: "ultra" });
	assert.deepEqual(invalid.value, DEFAULT_RENAME_CONFIG);
	assert.equal(invalid.warnings.length, 3);
});

test("rename config loads, merges, and saves", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-customizations-rename-"));
	const path = join(dir, "rename.json");
	try {
		assert.deepEqual(loadRenameConfig(path), {
			value: DEFAULT_RENAME_CONFIG,
			warnings: [],
		});

		writeFileSync(path, JSON.stringify({ afterSteps: 3 }), "utf8");
		saveRenameConfig(path, { model: "openai/gpt-5.6-sol" });
		assert.deepEqual(loadRenameConfig(path).value, {
			...DEFAULT_RENAME_CONFIG,
			afterSteps: 3,
			model: "openai/gpt-5.6-sol",
		});

		const saved = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		assert.equal(saved.afterSteps, 3);
		assert.equal(saved.model, "openai/gpt-5.6-sol");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	chamferPanelLine,
	shapePanelCaps,
	stabilizeThinkingToolSpacing,
	trimToolRulePadding,
} from "../lib/transcript-layout.ts";

const identity = (line: string): string => line;
const codePointWidth = (line: string): number => [...line].length;

test("assistant panel gets fractional top and bottom caps", () => {
	const lines = ["▐      ▌", "▐ prose ▌", "▐      ▌"];
	assert.deepEqual(shapePanelCaps(lines, identity, codePointWidth), [
		"🬞🬭🬭🬭🬭🬭🬭🬏",
		"▐ prose ▌",
		"🬁🬂🬂🬂🬂🬂🬂🬀",
	]);
});

test("blank Markdown rows inside a panel are not mistaken for caps", () => {
	const lines = ["▐     ▌", "▐ one ▌", "▐     ▌", "▐ two ▌", "▐     ▌"];
	const shaped = shapePanelCaps(lines, identity, codePointWidth);
	assert.equal(shaped[2], "▐     ▌");
	assert.match(shaped[0], /^🬞/u);
	assert.match(shaped[4], /^🬁/u);
});

test("non-panel rows are left untouched", () => {
	const line = "Thinking...";
	assert.equal(chamferPanelLine(line, "top", identity, codePointWidth), line);
	assert.deepEqual(shapePanelCaps(["", line], identity, codePointWidth), ["", line]);
});

test("thinking followed directly by a tool gets one stable separator", () => {
	const lines = ["", "Thinking..."];
	const layout = { hasThinking: true, hasProse: false, hasToolCall: true };
	assert.deepEqual(stabilizeThinkingToolSpacing(lines, layout), ["", "Thinking...", ""]);
	assert.deepEqual(stabilizeThinkingToolSpacing(["", "Thinking...", ""], layout), ["", "Thinking...", ""]);
});

test("thinking spacing is not added when prose already supplies it", () => {
	const lines = ["", "Thinking...", "", "🬞🬭🬭🬏", "▐ ok ▌", "🬁🬂🬂🬀"];
	assert.equal(stabilizeThinkingToolSpacing(lines, {
		hasThinking: true,
		hasProse: true,
		hasToolCall: true,
	}), lines);
});

test("thinking without a following tool is left alone", () => {
	const lines = ["", "Thinking..."];
	assert.equal(stabilizeThinkingToolSpacing(lines, {
		hasThinking: true,
		hasProse: false,
		hasToolCall: false,
	}), lines);
});

test("tool rules stop at content and Pi's pre-tool separator is removed", () => {
	const lines = ["", "│       ", "│ read  ", "│ done  ", "│       "];
	assert.deepEqual(trimToolRulePadding(lines, identity), ["│ read  ", "│ done  "]);
});

test("blank rows inside tool output remain intact", () => {
	const lines = ["", "│       ", "│ call  ", "│       ", "│ tail  ", "│       "];
	assert.deepEqual(trimToolRulePadding(lines, identity), [
		"│ call  ",
		"│       ",
		"│ tail  ",
	]);
});

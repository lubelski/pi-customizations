import assert from "node:assert/strict";
import test from "node:test";
import { createCopyFeedback } from "../lib/copy-feedback.ts";

test("copy feedback dims, disappears, and restarts distinctly on every result", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let content: string[] | undefined;
	const ui = {
		setWidget: (_key: string, lines: string[] | undefined) => { content = lines; },
		theme: { fg: (color: string, text: string) => `${color}:${text}` },
	} as unknown as Parameters<typeof createCopyFeedback>[0];
	const feedback = createCopyFeedback(ui);
	feedback.show("Copied");
	assert.deepEqual(content, ["success:Copied"]);
	t.mock.timers.tick(900);
	assert.deepEqual(content, ["dim:Copied"]);
	feedback.show("Copied");
	assert.deepEqual(content, ["success:Copied · 2"]);
	t.mock.timers.tick(700); // First toast's old expiry cannot clear the new one.
	assert.deepEqual(content, ["success:Copied · 2"]);
	t.mock.timers.tick(200);
	assert.deepEqual(content, ["dim:Copied · 2"]);
	t.mock.timers.tick(700);
	assert.equal(content, undefined);
	feedback.show("Could not copy code", true);
	assert.deepEqual(content, ["error:Could not copy code · 3"]);
	t.mock.timers.tick(2400);
	assert.deepEqual(content, ["dim:Could not copy code · 3"]);
	t.mock.timers.tick(800);
	assert.equal(content, undefined);
	feedback.show("Copied");
	feedback.show("Copied");
	assert.deepEqual(content, ["success:Copied · 5"]);
	feedback.dispose();
	assert.equal(content, undefined);
	t.mock.timers.tick(5000);
	feedback.show("Late completion");
	assert.equal(content, undefined);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	FOOTER_LINKS_ENTRY_TYPE,
	footerLinksFromBranch,
	normalizeFooterLinks,
} from "../lib/footer-links.ts";

test("normalizes labels and deduplicates URLs", () => {
	assert.deepEqual(normalizeFooterLinks([
		{ label: "  SPM-123\n ticket ", url: "https://linear.app/mercury/issue/SPM-123" },
		{ label: "duplicate", url: "https://linear.app/mercury/issue/SPM-123" },
		{ label: "Storybook", url: "http://localhost:6006/?path=/story/budgets" },
	]), [
		{ label: "SPM-123 ticket", url: "https://linear.app/mercury/issue/SPM-123" },
		{ label: "Storybook", url: "http://localhost:6006/?path=/story/budgets" },
	]);
});

test("rejects unsafe or unsupported URLs", () => {
	assert.throws(() => normalizeFooterLinks([{ label: "file", url: "file:///tmp/mock.html" }]), /http or https/);
	assert.throws(() => normalizeFooterLinks([{ label: "bad", url: "https://example.com\u001b]8;;oops" }]), /control/);
	assert.throws(() => normalizeFooterLinks([{ label: "bad", url: "not a URL" }]), /Invalid/);
});

test("restores the latest branch-local snapshot", () => {
	const first = { type: "custom", customType: FOOTER_LINKS_ENTRY_TYPE, data: {
		version: 1,
		links: [{ label: "Linear", url: "https://linear.app/example" }],
	} };
	const latest = { type: "custom", customType: FOOTER_LINKS_ENTRY_TYPE, data: {
		version: 1,
		links: [{ label: "PR", url: "https://github.com/example/repo/pull/1" }],
	} };
	assert.deepEqual(footerLinksFromBranch([first, { type: "message" }, latest]), latest.data.links);
	assert.deepEqual(footerLinksFromBranch([first, {
		type: "custom",
		customType: FOOTER_LINKS_ENTRY_TYPE,
		data: { version: 1, links: [] },
	}]), []);
});

test("malformed latest snapshots fail closed instead of reviving stale links", () => {
	assert.deepEqual(footerLinksFromBranch([
		{ type: "custom", customType: FOOTER_LINKS_ENTRY_TYPE, data: {
			version: 1,
			links: [{ label: "old", url: "https://example.com/old" }],
		} },
		{ type: "custom", customType: FOOTER_LINKS_ENTRY_TYPE, data: { version: 1, links: "bad" } },
	]), []);
});

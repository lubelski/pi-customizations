import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jiti } from "./pi-runtime.ts";

const { linkedWorktree, primaryCheckout } = await jiti.import("../extensions/stable-input-layout.ts");

test("footer distinguishes linked worktrees from main checkouts and non-repositories", () => {
	const temp = realpathSync(mkdtempSync(join(tmpdir(), "footer-location-")));
	const main = join(temp, "main");
	const linked = join(temp, "linked tree");
	const git = (...args: string[]) => execFileSync("git", args, { stdio: "ignore" });
	try {
		assert.equal(linkedWorktree(temp), undefined);
		assert.equal(primaryCheckout(temp), undefined);
		git("init", main);
		git("-C", main, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "initial");
		git("-C", main, "worktree", "add", "-b", "linked", linked);
		assert.equal(linkedWorktree(main), undefined);
		assert.equal(primaryCheckout(main), main);
		assert.equal(primaryCheckout(linked), main);
		assert.equal(linkedWorktree(linked), linked);
		mkdirSync(join(linked, "nested"));
		assert.equal(linkedWorktree(join(linked, "nested")), linked);
		assert.equal(primaryCheckout(join(linked, "nested")), main);
		git("-C", linked, "checkout", "--detach");
		assert.equal(primaryCheckout(linked), main);
		const bare = join(temp, "bare.git");
		git("clone", "--bare", main, bare);
		assert.equal(primaryCheckout(bare), undefined);
		const bareTree = join(temp, "bare tree");
		git("-C", bare, "worktree", "add", "--detach", bareTree);
		assert.equal(primaryCheckout(bareTree), undefined);
		assert.equal(linkedWorktree(bareTree), bareTree);
		assert.equal(linkedWorktree(join(temp, "missing")), undefined);
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
});

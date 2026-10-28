import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jiti, themeModule, tuiModule } from "./pi-runtime.ts";

const { default: install } = await jiti.import("../extensions/stable-input-layout.ts");

test("task workspace updates all location rows, persists, refreshes, and resets safely", async () => {
	const temp = realpathSync(mkdtempSync(join(tmpdir(), "task-workspace-")));
	const main = join(temp, "main");
	const linked = join(temp, "linked tree");
	const git = (...args: string[]) => execFileSync("git", args, { stdio: "ignore" });
	try {
		git("init", main);
		git("-C", main, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "initial");
		git("-C", main, "worktree", "add", "-b", "task", linked);
		const entries: any[] = [];
		let footer: any;
		let sessionCwd = main;
		const ctx = {
			mode: "tui", sessionManager: { getCwd: () => sessionCwd, getBranch: () => entries, getEntries: () => [] },
			getContextUsage: () => undefined, hasPendingMessages: () => false, isIdle: () => true,
			ui: {
				getEditorComponent() {}, setEditorComponent() {},
				setFooter(factory: any) {
					footer = factory({ requestRender() {} }, themeModule.getThemeByName("dark"), {
						onBranchChange: () => () => {}, getGitBranch: () => "launch-branch", getExtensionStatuses: () => new Map(),
					});
				},
			},
		};
		function boot() {
			const handlers = new Map();
			const tools = new Map();
			install({
				on: (name: string, fn: any) => handlers.set(name, fn), events: { on() {} },
				registerTool: (tool: any) => tools.set(tool.name, tool),
				registerShortcut() {}, registerCommand() {},
				appendEntry: (customType: string, data: any) => entries.push({ type: "custom", customType, data }),
				getAllTools: () => [], getActiveTools: () => [], getCommands: () => [],
			});
			handlers.get("session_start")({}, ctx);
			return { set: (path: string | null) => tools.get("set_task_workspace").execute("id", { path }), end: () => handlers.get("agent_end")() };
		}
		const rows = () => footer.render(500).slice(0, 3).map((s: string) => tuiModule.stripTerminalSequences(s).slice(0, 249).trim());
		let runtime = boot();
		assert.deepEqual(rows(), [`F: ${main}`, "B: launch-branch", "W: -"]);
		await runtime.set(linked);
		assert.deepEqual(rows(), [`F: ${main}`, "B: task", `W: ${linked}`]);
		await assert.rejects(runtime.set("relative"));
		await assert.rejects(runtime.set(join(temp, "missing")));
		assert.equal(rows()[1], "B: task");
		runtime = boot();
		assert.deepEqual(rows(), [`F: ${main}`, "B: task", `W: ${linked}`]);
		git("-C", linked, "checkout", "-b", "renamed");
		runtime.end();
		assert.equal(rows()[1], "B: renamed");
		git("-C", linked, "checkout", "--detach");
		runtime.end();
		assert.equal(rows()[1], "B: -");
		await runtime.set(temp);
		assert.deepEqual(rows(), [`F: ${temp}`, "B: -", "W: -"]);
		await runtime.set(null);
		runtime = boot();
		assert.equal(rows()[1], "B: launch-branch");
		sessionCwd = linked;
		runtime = boot();
		assert.deepEqual(rows(), [`F: ${main}`, "B: launch-branch", `W: ${linked}`]);
		sessionCwd = main;
		await runtime.set(linked);
		git("-C", main, "worktree", "remove", linked);
		runtime = boot();
		assert.equal(rows()[1], "B: launch-branch");
		entries.push({ type: "custom", customType: "pi-customization:workspace", data: { version: 1, path: 123 } });
		boot();
		assert.equal(rows()[1], "B: launch-branch");
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
});

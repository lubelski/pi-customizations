import type { Usage } from "@earendil-works/pi-ai";
import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type ReadonlyFooterDataProvider,
	type SessionEntry,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type EditorComponent, type TUI } from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

const LOWER_PANE_HEIGHT = 6;
const AUTOCOMPLETE_MAX_VISIBLE = LOWER_PANE_HEIGHT - 1;

type AutocompleteEditor = EditorComponent & {
	getAutocompleteMaxVisible?: () => number;
	isShowingAutocomplete?: () => boolean;
	// Runtime geometry maintained by pi-tui's Editor after each render.
	renderedAutocompleteHeight?: number;
};

type UsageTotals = Pick<Usage, "input" | "output" | "cacheRead" | "cacheWrite"> & {
	cost: number;
};

type QueueShortcuts = {
	submit: string;
	followUp: string;
	dequeue: string;
};

type LowerPaneState = {
	autocompleteOpen: boolean;
	shortcuts: QueueShortcuts;
};

function formatCount(count: number): string {
	if (count < 1_000) return String(count);
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
	return `${(count / 1_000_000).toFixed(count < 10_000_000 ? 1 : 0)}M`;
}

function formatCwd(cwd: string): string {
	const home = resolve(homedir());
	const absolute = resolve(cwd);
	const fromHome = relative(home, absolute);
	const insideHome = fromHome === "" || (fromHome !== ".." && !fromHome.startsWith(`..${sep}`) && !isAbsolute(fromHome));
	if (!insideHome) return cwd;
	return fromHome === "" ? "~" : `~${sep}${fromHome}`;
}

function sanitize(text: string): string {
	return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function usageTotals(entries: readonly SessionEntry[]): UsageTotals {
	const totals: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

	for (const entry of entries) {
		const candidate = entry as unknown as {
			type: string;
			usage?: Usage;
			message?: { usage?: Usage };
		};
		let usage: Usage | undefined;
		if (candidate.type === "usage" || candidate.type === "branch_summary" || candidate.type === "compaction") {
			usage = candidate.usage;
		} else if (candidate.type === "message") {
			usage = candidate.message?.usage;
		}
		if (!usage) continue;

		totals.input += usage.input ?? 0;
		totals.output += usage.output ?? 0;
		totals.cacheRead += usage.cacheRead ?? 0;
		totals.cacheWrite += usage.cacheWrite ?? 0;
		totals.cost += usage.cost?.total ?? 0;
	}

	return totals;
}

function valueLine(theme: Theme, value: string, width: number, emphasize = false): string {
	return truncateToWidth(
		theme.fg(emphasize ? "text" : "dim", value),
		width,
		theme.fg("dim", "…"),
	);
}

function splitLine(theme: Theme, left: string, right: string, width: number): string {
	const gap = 2;
	const rightWidth = visibleWidth(right);
	const leftWidth = width - rightWidth - gap;
	if (leftWidth < 4) return truncateToWidth(right, width, theme.fg("dim", "…"));

	const leftSide = truncateToWidth(left, leftWidth, theme.fg("dim", "…"));
	const padding = " ".repeat(Math.max(gap, width - visibleWidth(leftSide) - rightWidth));
	return leftSide + padding + right;
}

function shortcutLabel(key: string | undefined, fallback: string): string {
	if (!key) return fallback;
	const labels: Record<string, string> = {
		alt: "⌥",
		ctrl: "⌃",
		shift: "⇧",
		super: "⌘",
		enter: "↵",
		return: "↵",
		up: "↑",
		down: "↓",
	};
	return key.split("+").map((part) => labels[part] ?? part).join("");
}

function queueGuidance(theme: Theme, ctx: ExtensionContext, shortcuts: QueueShortcuts): string {
	const pending = ctx.hasPendingMessages();
	const state = pending ? "working + queued" : ctx.isIdle() ? "idle" : "working";
	const stateColor = pending ? "warning" : ctx.isIdle() ? "dim" : "accent";
	const controls = ` · ${shortcuts.submit} steer next turn · ${shortcuts.followUp} queue after task · ${shortcuts.dequeue} restore`;
	return theme.fg(stateColor, state) + theme.fg("dim", controls);
}

type StructuredTitle = {
	topic: string;
	type: string;
	generatedDate: string;
};

function parseStructuredTitle(title: string): StructuredTitle | undefined {
	const match = /^(\d{4})｜([A-Z]{3})｜(.+)$/.exec(title);
	if (!match) return undefined;
	return { generatedDate: match[1], type: match[2], topic: match[3].trim() };
}

function localDateStamp(timestamp: string | undefined, fallback: string): string {
	if (!timestamp) return fallback;
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return fallback;
	return `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function titleLine(theme: Theme, rawTitle: string, startedAt: string | undefined, width: number): string {
	const structured = parseStructuredTitle(rawTitle);
	if (!structured) return valueLine(theme, rawTitle, width, true);

	const metadata = `${structured.type} · ${localDateStamp(startedAt, structured.generatedDate)}`;
	const metadataWidth = visibleWidth(metadata);
	const gap = 2;
	const topicWidth = width - metadataWidth - gap;
	if (topicWidth < 4) return valueLine(theme, structured.topic, width, true);

	const topic = truncateToWidth(theme.fg("text", structured.topic), topicWidth, theme.fg("dim", "…"));
	const padding = " ".repeat(Math.max(gap, width - visibleWidth(topic) - metadataWidth));
	return topic + padding + theme.fg("dim", metadata);
}

function createFooter(
	tui: TUI,
	theme: Theme,
	footerData: ReadonlyFooterDataProvider,
	state: LowerPaneState,
	ctx: ExtensionContext,
) {
	const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

	return {
		dispose: unsubscribe,
		invalidate() {},
		render(width: number): string[] {
			if (state.autocompleteOpen) return [];

			const branch = footerData.getGitBranch();
			const project = branch ? `${formatCwd(ctx.sessionManager.getCwd())} (${branch})` : formatCwd(ctx.sessionManager.getCwd());

			const entries = ctx.sessionManager.getEntries();
			const totals = usageTotals(entries);
			const usageParts = [
				totals.input > 0 ? `↑${formatCount(totals.input)}` : undefined,
				totals.output > 0 ? `↓${formatCount(totals.output)}` : undefined,
				totals.cacheRead > 0 ? `R${formatCount(totals.cacheRead)}` : undefined,
				totals.cacheWrite > 0 ? `W${formatCount(totals.cacheWrite)}` : undefined,
				totals.cost > 0 ? `$${totals.cost.toFixed(3)}` : undefined,
			].filter((part): part is string => part !== undefined);

			const context = ctx.getContextUsage();
			const contextValue = context
				? `${context.percent === null ? "?" : `${context.percent.toFixed(1)}%`} / ${formatCount(context.contextWindow)}`
				: "—";

			const model = ctx.model;
			const modelValue = model
				? `${model.provider}/${model.id}${model.reasoning ? ` • ${ctx.thinkingLevel ?? "off"}` : ""}`
				: "no model";

			const statuses = Array.from(footerData.getExtensionStatuses().entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([, value]) => sanitize(value))
				.filter(Boolean)
				.join("  ");

			const title = sanitize(ctx.sessionManager.getSessionName() ?? "Untitled conversation");

			return [
				splitLine(theme, theme.fg("dim", project), queueGuidance(theme, ctx, state.shortcuts), width),
				valueLine(theme, usageParts.join(" ") || "—", width),
				valueLine(theme, contextValue, width),
				valueLine(theme, modelValue, width),
				valueLine(theme, statuses || "—", width),
				titleLine(theme, title, entries[0]?.timestamp, width),
			];
		},
	};
}

/**
 * Keep the lower pane a constant height. Session information occupies it while
 * the editor is idle; autocomplete replaces that information instead of
 * pushing the editor and transcript upward.
 */
export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		const state: LowerPaneState = {
			autocompleteOpen: false,
			shortcuts: { submit: "↵", followUp: "⌥↵", dequeue: "⌥↑" },
		};
		const previousFactory = ctx.ui.getEditorComponent();

		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			state.shortcuts = {
				submit: shortcutLabel(keybindings.getKeys("tui.input.submit")[0], "↵"),
				followUp: shortcutLabel(keybindings.getKeys("app.message.followUp")[0], "⌥↵"),
				dequeue: shortcutLabel(keybindings.getKeys("app.message.dequeue")[0], "⌥↑"),
			};

			const editor: AutocompleteEditor = previousFactory
				? previousFactory(tui, theme, keybindings)
				: new CustomEditor(tui, theme, keybindings);

			// InteractiveMode copies its configured value into custom editors after
			// this factory returns. Keep this experiment's shared pane at six rows.
			const setAutocompleteMaxVisible = editor.setAutocompleteMaxVisible?.bind(editor);
			if (setAutocompleteMaxVisible) {
				editor.setAutocompleteMaxVisible = () => setAutocompleteMaxVisible(AUTOCOMPLETE_MAX_VISIBLE);
				setAutocompleteMaxVisible(AUTOCOMPLETE_MAX_VISIBLE);
			}

			const render = editor.render.bind(editor);
			editor.render = (width: number): string[] => {
				const lines = render(width);
				const autocompleteOpen = editor.isShowingAutocomplete?.() ?? false;
				if (state.autocompleteOpen !== autocompleteOpen) {
					state.autocompleteOpen = autocompleteOpen;
					tui.requestRender();
				}
				if (!autocompleteOpen) return lines;

				const actualHeight = editor.renderedAutocompleteHeight ?? 0;
				const missingRows = Math.max(0, LOWER_PANE_HEIGHT - actualHeight);
				return missingRows === 0 ? lines : lines.concat(Array<string>(missingRows).fill(""));
			};

			return editor;
		});

		ctx.ui.setFooter((tui, theme, footerData) => createFooter(tui, theme, footerData, state, ctx));
	});
}

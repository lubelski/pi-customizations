import { Type, type Usage } from "@earendil-works/pi-ai";
import {
	CustomEditor,
	defineTool,
	type ExtensionAPI,
	type ExtensionContext,
	type ReadonlyFooterDataProvider,
	type SessionEntry,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	hyperlink,
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth,
	type EditorComponent,
	type TUI,
} from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { styleDivider } from "../lib/divider-style.ts";
import {
	FOOTER_LINKS_ENTRY_TYPE,
	MAX_FOOTER_LINKS,
	footerLinksFromBranch,
	normalizeFooterLinks,
	type FooterLink,
} from "../lib/footer-links.ts";
import { mcpServerNamesFromTools } from "../lib/mcp-footer.ts";

const LOWER_PANE_HEIGHT = 7;
const AUTOCOMPLETE_MAX_VISIBLE = LOWER_PANE_HEIGHT - 1;
const MCP_STATUS_EVENT = "pi-mcp-adapter/status/v1";
const CUSTOMIZATION_STATUS_PREFIX = "pi-customization:";

type AutocompleteEditor = EditorComponent & {
	getAutocompleteMaxVisible?: () => number;
	isShowingAutocomplete?: () => boolean;
	// Runtime geometry maintained by pi-tui's Editor after each render.
	renderedAutocompleteHeight?: number;
};

type UsageTotals = Pick<Usage, "input" | "output" | "cacheRead" | "cacheWrite"> & {
	cost: number;
};

type McpStatusSnapshot = {
	version: 1;
	servers: ReadonlyArray<{
		name: string;
		status: string;
		disabled: boolean;
	}>;
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
	return stripTerminalSequences(text).replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function parseMcpStatusSnapshot(value: unknown): McpStatusSnapshot | undefined {
	if (!value || typeof value !== "object") return undefined;
	const candidate = value as Partial<McpStatusSnapshot>;
	if (candidate.version !== 1 || !Array.isArray(candidate.servers)) return undefined;
	return candidate as McpStatusSnapshot;
}

function namedMcpStatus(snapshot: McpStatusSnapshot | undefined, fallbackNames: string[]): string | undefined {
	const snapshotNames = snapshot?.servers
		.filter((server) => !server.disabled)
		.map((server) => server.name) ?? [];
	const names = snapshotNames.length > 0 ? snapshotNames : fallbackNames;
	const servers = [...new Set(names)].filter(Boolean).sort((a, b) => a.localeCompare(b));
	return servers.length > 0 ? `MCP: ${servers.join(", ")}` : undefined;
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

function footerLinksValue(theme: Theme, links: readonly FooterLink[]): string {
	const separator = theme.fg("dim", " · ");
	return links
		.map(({ label, url }) => hyperlink(theme.fg("accent", theme.underline(label)), url))
		.join(separator);
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
	const controls = ` · ${shortcuts.submit} steer next turn · ${shortcuts.followUp} queue after task · ${shortcuts.dequeue} edit queue`;
	return theme.fg(stateColor, state) + theme.fg("dim", controls);
}

function createFooter(
	tui: TUI,
	theme: Theme,
	footerData: ReadonlyFooterDataProvider,
	state: LowerPaneState,
	ctx: ExtensionContext,
	getMcpStatus: () => McpStatusSnapshot | undefined,
	getMcpServerNames: () => string[],
	getFooterLinks: () => readonly FooterLink[],
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
				totals.input > 0 ? `↑ ${formatCount(totals.input)}` : undefined,
				totals.output > 0 ? `↓ ${formatCount(totals.output)}` : undefined,
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

			const extensionStatuses = footerData.getExtensionStatuses();
			const adapterMcpStatus = extensionStatuses.get("mcp")
				? sanitize(extensionStatuses.get("mcp")!).replace(/^🔌\s*/u, "")
				: undefined;
			const mcpStatus = namedMcpStatus(getMcpStatus(), getMcpServerNames()) ?? adapterMcpStatus;
			const customizationNames = Array.from(extensionStatuses.entries())
				.filter(([key]) => key.startsWith(CUSTOMIZATION_STATUS_PREFIX))
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([, value]) => sanitize(value))
				.filter(Boolean);
			const otherStatuses = Array.from(extensionStatuses.entries())
				.filter(([key]) => key !== "mcp" && !key.startsWith(CUSTOMIZATION_STATUS_PREFIX))
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([, value]) => sanitize(value))
				.filter(Boolean);
			const customizations = [
				customizationNames.length > 0 ? `EXT: ${customizationNames.join(" · ")}` : "EXT: —",
				...otherStatuses,
			].join("  ");

			return [
				splitLine(theme, theme.fg("dim", project), queueGuidance(theme, ctx, state.shortcuts), width),
				valueLine(theme, usageParts.join(" ") || "—", width),
				valueLine(theme, contextValue, width),
				valueLine(theme, modelValue, width),
				splitLine(
					theme,
					footerLinksValue(theme, getFooterLinks()),
					theme.fg("dim", mcpStatus || "MCP: —"),
					width,
				),
				splitLine(theme, "", theme.fg("dim", customizations), width),
				"", // Preserve the seven-row dock; the title now lives in the top bar.
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
	let latestMcpStatus: McpStatusSnapshot | undefined;
	let footerLinks: FooterLink[] = [];
	let activeTui: TUI | undefined;

	pi.registerTool(defineTool({
		name: "set_footer_links",
		label: "Set footer links",
		description: "Replace the clickable links shown in this session's footer. Send the complete current list, using short labels for relevant Linear tickets, local mock or Storybook pages, pull requests, and similar task resources. Pass an empty list to clear stale links.",
		promptSnippet: "Set the session footer's relevant task links.",
		promptGuidelines: [
			"Keep relevant Linear tickets, local mock or Storybook pages, and pull requests available with set_footer_links; send the complete current list on each update.",
		],
		parameters: Type.Object({
			links: Type.Array(Type.Object({
				label: Type.String({ minLength: 1, maxLength: 32, description: "Short display label, such as SPM-123, Mock, Storybook, or PR #123" }),
				url: Type.String({ minLength: 1, maxLength: 2_048, description: "Absolute http or https URL" }),
			}, { additionalProperties: false }), { maxItems: MAX_FOOTER_LINKS }),
		}, { additionalProperties: false }),
		executionMode: "sequential",
		annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
		async execute(_toolCallId, params) {
			footerLinks = normalizeFooterLinks(params.links);
			pi.appendEntry(FOOTER_LINKS_ENTRY_TYPE, { version: 1, links: footerLinks });
			activeTui?.requestRender();
			const text = footerLinks.length === 0
				? "Cleared footer links."
				: `Footer links: ${footerLinks.map((link) => link.label).join(", ")}`;
			return { content: [{ type: "text", text }], details: { links: footerLinks } };
		},
	}));

	pi.events.on(MCP_STATUS_EVENT, (value) => {
		latestMcpStatus = parseMcpStatusSnapshot(value);
		activeTui?.requestRender();
	});

	pi.on("session_start", (_event, ctx) => {
		footerLinks = footerLinksFromBranch(ctx.sessionManager.getBranch());
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

			const editor = (previousFactory
				? previousFactory(tui, theme, keybindings)
				: new CustomEditor(tui, theme, keybindings)) as unknown as AutocompleteEditor;

			// InteractiveMode copies its configured value into custom editors after
			// this factory returns. Keep this experiment's shared pane at seven rows.
			const setAutocompleteMaxVisible = editor.setAutocompleteMaxVisible?.bind(editor);
			if (setAutocompleteMaxVisible) {
				editor.setAutocompleteMaxVisible = () => setAutocompleteMaxVisible(AUTOCOMPLETE_MAX_VISIBLE);
				setAutocompleteMaxVisible(AUTOCOMPLETE_MAX_VISIBLE);
			}

			const render = editor.render.bind(editor);
			editor.render = (width: number): string[] => {
				// Pi updates borderColor for thinking levels; apply our shared divider
				// color at render time so both input rules stay matched to the header.
				// The factory receives only EditorTheme. Read the full, current Theme
				// from ctx.ui so theme changes are also reflected without a reload.
				editor.borderColor = (text) => styleDivider(ctx.ui.theme, text);
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

		ctx.ui.setFooter((tui, theme, footerData) => {
			activeTui = tui;
			return createFooter(
				tui,
				theme,
				footerData,
				state,
				ctx,
				() => latestMcpStatus,
				() => mcpServerNamesFromTools(pi.getAllTools()),
				() => footerLinks,
			);
		});
	});
}

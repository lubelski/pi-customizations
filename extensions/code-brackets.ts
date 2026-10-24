import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Markdown, stripTerminalSequences, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

const ORIGINAL = Symbol.for("will.pi.code-brackets.original-token");
const WRAPPED = Symbol.for("will.pi.code-brackets.wrapped-token");

type Token = { type: string; raw?: string; lang?: string };
type MarkdownInternals = {
	theme: { codeBlockBorder(text: string): string; codeBlockIndent?: string };
	renderToken(token: Token, width: number, nextType?: string, style?: unknown): string[];
};

/** Patch parsed fenced tokens, never search rendered prose for backticks. */
export default function (pi: ExtensionAPI): void {
	const target = Markdown.prototype as unknown as MarkdownInternals & Record<PropertyKey, unknown>;
	if (typeof target.renderToken !== "function") return;
	const original = target.renderToken === target[WRAPPED]
		? target[ORIGINAL] as MarkdownInternals["renderToken"] : target.renderToken;
	const wrapper: MarkdownInternals["renderToken"] = function (this: MarkdownInternals, token, width, nextType, style) {
		const lines = original.call(this, token, width, nextType, style);
		if (token.type !== "code" || !/^\s*(?:`{3,}|~{3,})/.test(token.raw ?? "") || width < 1) return lines;
		const trailingSpace = nextType && nextType !== "space" ? 1 : 0;
		const closing = lines.length - 1 - trailingSpace;
		// Fail harmlessly if Pi changes its native token layout.
		if (closing < 1 || stripTerminalSequences(lines[closing]) !== "```" ||
			!stripTerminalSequences(lines[0]).startsWith("```")) return lines;
		const label = stripTerminalSequences(token.lang ?? "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ").trim();
		const top = truncateToWidth(label ? `┌${label}─` : "┌", width);
		const border = (text: string) => this.theme.codeBlockBorder(text);
		const result = [border(top)];
		const indent = this.theme.codeBlockIndent ?? "  ";
		const prefix = width >= 3 ? "│ " : width === 2 ? "│" : "";
		for (const line of lines.slice(1, closing)) {
			const code = line.startsWith(indent) ? line.slice(indent.length) : line;
			for (const wrapped of wrapTextWithAnsi(code, Math.max(1, width - prefix.length))) {
				result.push(border(prefix) + wrapped);
			}
		}
		result.push(border(`└${"─".repeat(Math.max(0, visibleWidth(top) - 1))}`));
		if (trailingSpace) result.push("");
		return result;
	};
	Object.defineProperty(target, ORIGINAL, { value: original, configurable: true });
	Object.defineProperty(target, WRAPPED, { value: wrapper, configurable: true });
	target.renderToken = wrapper;
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode === "tui") ctx.ui.setStatus("pi-customization:code-brackets", "code-brackets");
	});
}

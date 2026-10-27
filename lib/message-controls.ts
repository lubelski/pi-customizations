import { Text, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { marked } from "marked";
import { shapePanelCaps } from "./transcript-layout.ts";

export type MessageControlState = { plain: boolean };
type MarkdownBlock = {
	text: string;
	render(width: number): string[];
};

export function codeBlocks(source: string): string[] {
	const blocks: string[] = [];
	marked.walkTokens(marked.lexer(source), token => {
		if (token.type === "code") blocks.push(token.text);
	});
	return blocks;
}

/** Share one mode across all blocks without installing any mouse hit areas. */
export function attachMessageRendering(block: MarkdownBlock, state: MessageControlState,
	dividerStyle: (text: string) => string = text => text): void {
	const render = block.render.bind(block);
	block.render = width => {
		if (width < 1) return [];
		if (!state.plain) return shapePanelCaps(render(width).slice(), stripTerminalSequences, visibleWidth);
		const divider = dividerStyle("─".repeat(width));
		// Retain the formatted content width while removing its one-column gutter.
		const body = new Text(stripTerminalSequences(block.text), 0, 0).render(Math.max(1, width - 2));
		return [divider, ...body, divider];
	};
}

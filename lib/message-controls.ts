import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import { Text, sliceByColumn, stripTerminalSequences, visibleWidth, type TuiMouseEvent, type TuiMouseEventResult } from "@earendil-works/pi-tui";
import { marked } from "marked";

export type MessageControlState = { plain: boolean };
type MarkdownBlock = {
	text: string;
	render(width: number): string[];
	handleMouse?(event: TuiMouseEvent): TuiMouseEventResult | undefined;
};

export function codeBlocks(source: string): string[] {
	const blocks: string[] = [];
	marked.walkTokens(marked.lexer(source), token => {
		if (token.type === "code") blocks.push(token.text);
	});
	return blocks;
}

/** Hit areas cover labels only, leaving the body available for selection. */
export function attachMessageControls(block: MarkdownBlock, state: MessageControlState,
	notify: (message: string, error?: boolean) => void): void {
	const render = block.render.bind(block);
	let areas: { start: number; end: number; action: () => void }[] = [];
	block.render = width => {
		areas = [];
		if (width < 1) return [];
		const lines = state.plain
			? ["", ...new Text(stripTerminalSequences(block.text), 0, 0).render(width)]
			: render(width).slice();
		const codes = codeBlocks(block.text);
		const controls = [{ label: state.plain ? "[formatted]" : "[plain text]", action: () => { state.plain = !state.plain; } }];
		if (codes.length) controls.push({ label: codes.length === 1 ? "[copy code]" : "[copy all code]", action: () => {
			void copyToClipboard(codes.join("\n\n")).then(() => notify("Code copied"), () => notify("Could not copy code", true));
		} });
		const labels = controls.map(c => c.label).join(" ");
		// Hide controls rather than create clipped, misleading hit targets.
		if (labels.length + 2 > width) return lines;
		const start = width - labels.length - 1;
		let x = start;
		for (const control of controls) {
			areas.push({ start: x, end: x + control.label.length, action: control.action });
			x += control.label.length + 1;
		}
		const first = lines[0] ?? "";
		lines[0] = sliceByColumn(first, 0, start) + "\x1b[0m" + " ".repeat(Math.max(0, start - Math.min(start, visibleWidth(first)))) + labels + " ";
		return lines;
	};
	block.handleMouse = event => {
		if (event.type !== "click" || event.button !== "left" || event.y !== 0) return undefined;
		const area = areas.find(area => event.x >= area.start && event.x < area.end);
		if (!area) return undefined;
		area.action();
		return { handled: true };
	};
}

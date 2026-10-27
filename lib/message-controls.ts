import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import { Text, sliceByColumn, stripTerminalSequences, visibleWidth, type TuiMouseEvent, type TuiMouseEventResult } from "@earendil-works/pi-tui";
import { marked } from "marked";
import { shapePanelCaps } from "./transcript-layout.ts";

export type MessageControlState = { plain: boolean; expanded?: boolean };
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
	notify: (message: string, error?: boolean) => void,
	buttonStyle: (text: string, plain: boolean) => string = text => text,
	copy: (text: string) => Promise<void> = copyToClipboard): void {
	const render = block.render.bind(block);
	let areas: { start: number; end: number; action: () => void }[] = [];
	block.render = width => {
		areas = [];
		if (width < 1) return [];
		const lines = state.plain
			? ["", ...new Text(stripTerminalSequences(block.text), 0, 0).render(width)]
			: shapePanelCaps(render(width).slice(), stripTerminalSequences, visibleWidth);
		const trigger = { label: state.expanded ? "›" : "‹", action: () => { state.expanded = !state.expanded; } };
		const controls = state.expanded ? [
			{ label: "fmt", action: () => { state.plain = !state.plain; } },
			{ label: "copy", action: () => {
				void copy(block.text).then(() => notify("Text copied"), () => notify("Could not copy text", true));
			} },
			trigger,
		] : [trigger];
		const padding = state.plain ? "" : " ";
		const gap = 2;
		const rightMargin = 2;
		const measureControls = () => controls.reduce((sum, control) => sum + control.label.length + padding.length * 2, 0) + gap * (controls.length - 1);
		if (measureControls() + rightMargin + 1 > width) controls.splice(0, controls.length, trigger);
		const controlsWidth = measureControls();
		// Leave the left corner intact and hide controls rather than clip hit targets.
		if (controlsWidth + rightMargin + 1 > width) return lines;
		const start = width - controlsWidth - rightMargin;
		const first = lines[0] ?? "";
		const capSlice = (from: number, length: number) => {
			const slice = sliceByColumn(first, from, length);
			return slice + " ".repeat(Math.max(0, length - visibleWidth(slice)));
		};
		let row = capSlice(0, start);
		let x = start;
		for (let index = 0; index < controls.length; index++) {
			const control = controls[index];
			const label = padding + control.label + padding;
			areas.push({ start: x + padding.length, end: x + padding.length + control.label.length, action: control.action });
			row += "\x1b[0m" + buttonStyle(label, state.plain) + "\x1b[0m";
			x += label.length;
			if (index < controls.length - 1) {
				row += capSlice(x, gap);
				x += gap;
			}
		}
		lines[0] = row + capSlice(x, width - x);
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

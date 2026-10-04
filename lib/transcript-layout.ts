export type StripTerminalSequences = (line: string) => string;
export type VisibleWidth = (line: string) => number;

export const LEFT_PANEL_EDGE = "▐"; // right half block
export const RIGHT_PANEL_EDGE = "▌"; // left half block
export const BLANK_PANEL_LINE = /^▐ *▌$/u;
export const BLANK_TOOL_RULE_LINE = /^│ *$/u;

export type ThinkingLayout = {
	hasThinking: boolean;
	hasProse: boolean;
	hasToolCall: boolean;
};

export function chamferPanelLine(
	line: string,
	edge: "top" | "bottom",
	strip: StripTerminalSequences,
	visibleWidth: VisibleWidth,
): string {
	const plain = strip(line);
	const left = line.indexOf(LEFT_PANEL_EDGE);
	const right = line.lastIndexOf(RIGHT_PANEL_EDGE);
	if (!BLANK_PANEL_LINE.test(plain) || left < 0 || right <= left) return line;

	const middleWidth = visibleWidth(plain) - 2;
	const fill = edge === "top" ? "🬭" : "🬂";
	const leftCorner = edge === "top" ? "🬞" : "🬁";
	const rightCorner = edge === "top" ? "🬏" : "🬀";
	return line.slice(0, left) + leftCorner + fill.repeat(middleWidth) + rightCorner + line.slice(right + 1);
}

/** Shape only the outer padding rows; blank rows inside Markdown stay intact. */
export function shapePanelCaps(
	lines: string[],
	strip: StripTerminalSequences,
	visibleWidth: VisibleWidth,
): string[] {
	const blankPanelLines: number[] = [];
	for (let index = 0; index < lines.length; index++) {
		if (BLANK_PANEL_LINE.test(strip(lines[index]))) blankPanelLines.push(index);
	}
	if (blankPanelLines.length < 2) return lines;

	const top = blankPanelLines[0];
	const bottom = blankPanelLines.at(-1)!;
	if (top === bottom) return lines;

	const result = [...lines];
	result[top] = chamferPanelLine(result[top], "top", strip, visibleWidth);
	result[bottom] = chamferPanelLine(result[bottom], "bottom", strip, visibleWidth);
	return result;
}

/** Remove Pi's separator and the vertical rule's box padding, not tool content. */
export function trimToolRulePadding(lines: string[], strip: StripTerminalSequences): string[] {
	let start = 0;
	let end = lines.length;

	if (strip(lines[start] ?? "").trim() === "") start++;
	if (end > start && BLANK_TOOL_RULE_LINE.test(strip(lines[start] ?? ""))) start++;
	if (end > start && BLANK_TOOL_RULE_LINE.test(strip(lines[end - 1] ?? ""))) end--;
	return start === 0 && end === lines.length ? lines : lines.slice(start, end);
}

/**
 * Pi already separates thinking from following prose. It deliberately omits
 * that spacer before separately rendered tools, so add exactly one there.
 */
export function stabilizeThinkingToolSpacing(lines: string[], layout: ThinkingLayout): string[] {
	if (!layout.hasThinking || layout.hasProse || !layout.hasToolCall) return lines;
	if (lines.length === 0 || lines.at(-1)?.trim() === "") return lines;
	return [...lines, ""];
}

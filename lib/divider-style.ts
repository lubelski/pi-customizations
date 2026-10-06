import type { Theme } from "@earendil-works/pi-coding-agent";
import { mixColors } from "@earendil-works/pi-tui";

/** Shared header/input rule color. Requires the full UI Theme, not EditorTheme. */
export function styleDivider(theme: Theme, text: string): string {
	return theme.style(text, {
		fg: mixColors(theme.colors.userMessageBg, theme.colors.accent, 0.12),
	});
}

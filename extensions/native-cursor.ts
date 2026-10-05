import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER } from "@earendil-works/pi-tui";

const REVERSE_VIDEO = "\x1b[7m";
const RESET_STYLE = "\x1b[0m";

/**
 * Pi draws a reverse-video cell as a software cursor even when the terminal's
 * hardware cursor is enabled. Remove only that cell's styling, leaving the
 * cursor marker in place so the TUI can position iTerm's blinking bar cursor.
 */
function removeSoftwareCursor(line: string): string {
	const markerIndex = line.indexOf(CURSOR_MARKER);
	if (markerIndex === -1) return line;

	const styleStart = markerIndex + CURSOR_MARKER.length;
	if (!line.startsWith(REVERSE_VIDEO, styleStart)) return line;

	const contentStart = styleStart + REVERSE_VIDEO.length;
	const styleEnd = line.indexOf(RESET_STYLE, contentStart);
	if (styleEnd === -1) return line;

	return line.slice(0, styleStart) + line.slice(contentStart, styleEnd) + line.slice(styleEnd + RESET_STYLE.length);
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setStatus("pi-customization:native-cursor", "native-cursor");

		// Compose with any editor installed by an extension loaded before this one.
		const previousFactory = ctx.ui.getEditorComponent();
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const editor = previousFactory
				? previousFactory(tui, theme, keybindings)
				: new CustomEditor(tui, theme, keybindings);
			const render = editor.render.bind(editor);

			editor.render = (width: number): string[] => render(width).map(removeSoftwareCursor);
			return editor;
		});
	});
}

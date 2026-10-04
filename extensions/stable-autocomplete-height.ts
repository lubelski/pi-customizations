import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EditorComponent } from "@earendil-works/pi-tui";

type AutocompleteEditor = EditorComponent & {
	getAutocompleteMaxVisible?: () => number;
	isShowingAutocomplete?: () => boolean;
	// Runtime geometry maintained by pi-tui's Editor after each render.
	renderedAutocompleteHeight?: number;
};

/**
 * Keep the editor's autocomplete area at a fixed height while it is open.
 * pi-tui normally returns only as many rows as there are filtered matches,
 * which moves everything below the editor as the result set narrows.
 */
export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		// Compose with editor customizations installed by other user extensions.
		const previousFactory = ctx.ui.getEditorComponent();
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const editor: AutocompleteEditor = previousFactory
				? previousFactory(tui, theme, keybindings)
				: new CustomEditor(tui, theme, keybindings);
			const render = editor.render.bind(editor);

			editor.render = (width: number): string[] => {
				const lines = render(width);
				if (!editor.isShowingAutocomplete?.()) return lines;

				const actualHeight = editor.renderedAutocompleteHeight ?? 0;
				if (actualHeight === 0) return lines;

				// SelectList can add one row for its “(selected/total)” scroll indicator.
				// Reserve that row too so filtering never changes the menu's footprint.
				const maxVisible = editor.getAutocompleteMaxVisible?.() ?? 5;
				const fixedHeight = maxVisible + 1;
				const missingRows = Math.max(0, fixedHeight - actualHeight);

				return missingRows === 0 ? lines : lines.concat(Array<string>(missingRows).fill(""));
			};

			return editor;
		});
	});
}

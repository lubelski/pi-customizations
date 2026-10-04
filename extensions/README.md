# Extensions

## Installation

Link each extension into Pi's user extension directory:

```sh
mkdir -p "$HOME/.pi/agent/extensions"
for extension in "$HOME/dev/pi-customizations/extensions/"*.ts; do
  ln -sf "$extension" "$HOME/.pi/agent/extensions/$(basename "$extension")"
done
```

After installing or updating an extension, run `/reload` inside Pi.

## `half-bleed.ts`

Shapes Pi's existing colored transcript panels without changing their terminal-cell layout:

- content rows use half-cell colored side edges;
- top and bottom caps occupy one third of a row;
- corner cells use individual sextants for exact square intersections, with no diagonal treatment.

The side edges use standard Unicode Block Elements. The caps and corners require support for the Symbols for Legacy Computing sextants.

## `native-cursor.ts`

Removes Pi's reverse-video software cursor while preserving the cursor marker used to position the terminal's native cursor. The extension does not choose the native cursor's shape; that remains a terminal setting.

## `recessed-tools.ts`

Makes tool activity secondary to the assistant's prose while preserving access to its details:

- collapsed tool panels show at most seven lines, retaining both their beginning and end;
- expanding a tool still reveals the complete component;
- successful tool panels use the quieter pending-tool background;
- tool titles and output use the theme's dim text color;
- errors retain their distinct background;
- image results are not truncated.

## `stable-input-layout.ts`

Keeps a six-row pane below the editor so the input and transcript remain anchored:

- while idle, the pane shows project, usage, context, model, extension status, and conversation title on separate lines;
- the conversation title always occupies the bottom line;
- while autocomplete is open, up to five choices plus its scroll indicator replace the session information in the same space;
- short autocomplete lists are padded to the same height, so filtering does not move the input;
- the terminal's native cursor customization continues to compose with the custom editor.

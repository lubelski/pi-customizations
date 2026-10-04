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

## `stable-autocomplete-height.ts`

Keeps the editor's autocomplete menu at a fixed height while it is open, preventing content below it from moving as results are filtered.

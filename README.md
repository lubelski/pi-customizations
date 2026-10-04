# Pi customizations

User-level customizations for [Pi](https://github.com/earendil-works/pi).

## Extensions

### `half-bleed.ts`

Shapes Pi's existing colored transcript panels without changing their terminal-cell layout:

- content rows use half-cell colored side edges;
- top and bottom caps occupy one third of a row;
- corner cells use individual sextants for exact square intersections, with no diagonal treatment.

Install it as a user extension:

```sh
ln -s "$HOME/dev/pi-customizations/extensions/half-bleed.ts" \
  "$HOME/.pi/agent/extensions/half-bleed.ts"
```

The side edges use standard Unicode Block Elements. The caps and corners require support for the Symbols for Legacy Computing sextants.

### `hardware-cursor.ts`

Removes Pi's reverse-video software cursor while preserving the cursor marker used to position the terminal's native hardware cursor.

```sh
ln -s "$HOME/dev/pi-customizations/extensions/hardware-cursor.ts" \
  "$HOME/.pi/agent/extensions/hardware-cursor.ts"
```

### `stable-autocomplete-height.ts`

Keeps the editor's autocomplete menu at a fixed height while it is open, preventing content below it from moving as results are filtered.

```sh
ln -s "$HOME/dev/pi-customizations/extensions/stable-autocomplete-height.ts" \
  "$HOME/.pi/agent/extensions/stable-autocomplete-height.ts"
```

After installing or updating an extension, run `/reload` inside Pi.

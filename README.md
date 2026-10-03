# Pi customizations

User-level customizations for [Pi](https://github.com/earendil-works/pi).

## Extensions

### `half-bleed.ts`

Makes transcript panels less full-bleed without changing their terminal-cell layout:

- user-message panels have a shaped half-cell left edge and remain full-bleed on the right;
- other transcript panels have half-cell margins on both sides;
- one-third-row top and bottom padding using Unicode sextants;
- small diagonal corner clips using Symbols for Legacy Computing.

Install it as a user extension:

```sh
ln -s "$HOME/dev/pi-customizations/extensions/half-bleed.ts" \
  "$HOME/.pi/agent/extensions/half-bleed.ts"
```

Then run `/reload` inside Pi.

The sextant and diagonal glyphs require a terminal font with support for the Unicode Symbols for Legacy Computing block.

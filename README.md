# Pi customizations

User-level customizations for [Pi](https://github.com/earendil-works/pi).

## Extensions

### `half-bleed.ts`

Gives transcript messages asymmetric colored panels:

- user messages have a shaped left edge and remain full-bleed on the right;
- assistant responses use a gray background, remain full-bleed on the left, and have a shaped right edge;
- other transcript panels have half-cell margins on both sides;
- one-third-row top and bottom padding uses Unicode sextants;
- small diagonal corner clips use Symbols for Legacy Computing.

Install it as a user extension:

```sh
ln -s "$HOME/dev/pi-customizations/extensions/half-bleed.ts" \
  "$HOME/.pi/agent/extensions/half-bleed.ts"
```

Then run `/reload` inside Pi.

The sextant and diagonal glyphs require a terminal font with support for the Unicode Symbols for Legacy Computing block.

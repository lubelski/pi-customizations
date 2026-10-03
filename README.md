# Pi customizations

User-level customizations for [Pi](https://github.com/earendil-works/pi).

## Extensions

### `half-bleed.ts`

Makes transcript panels less full-bleed without changing their terminal-cell layout:

- half-cell side margins using standard block elements;
- half-row top and bottom caps;
- faux-rounded corners using standard quadrant blocks.

Install it as a user extension:

```sh
ln -s "$HOME/dev/pi-customizations/extensions/half-bleed.ts" \
  "$HOME/.pi/agent/extensions/half-bleed.ts"
```

Then run `/reload` inside Pi.

The panel geometry uses widely supported Unicode Block Elements.

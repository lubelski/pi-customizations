# Pi customizations

User-level customizations for [Pi](https://github.com/earendil-works/pi).

## Extensions

### `half-bleed.ts`

Shapes Pi's existing colored transcript panels without changing their terminal-cell layout:

- factory-default one-cell colored padding remains between content and each panel edge;
- Pi's existing outer viewport gutter remains terminal-colored;
- half-row top and bottom caps use faux-rounded quadrant corners.

Install it as a user extension:

```sh
ln -s "$HOME/dev/pi-customizations/extensions/half-bleed.ts" \
  "$HOME/.pi/agent/extensions/half-bleed.ts"
```

Then run `/reload` inside Pi.

The panel geometry uses widely supported Unicode Block Elements.

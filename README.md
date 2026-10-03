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

Then run `/reload` inside Pi.

The side edges use standard Unicode Block Elements. The caps and corners require support for the Symbols for Legacy Computing sextants.

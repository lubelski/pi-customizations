# Pi customizations

Personal UI extensions and themes for [Pi](https://github.com/earendil-works/pi).

## Included extensions

- [`assistant-background.ts`](extensions/assistant-background.ts) — gives assistant prose a shaped neutral-gray panel
- [`half-bleed.ts`](extensions/half-bleed.ts) — reshapes message panels and reduces tools to a thin left rule
- [`native-cursor.ts`](extensions/native-cursor.ts) — uses the terminal's native cursor
- [`recessed-tools.ts`](extensions/recessed-tools.ts) — makes tool activity more compact and subdued
- [`stable-input-layout.ts`](extensions/stable-input-layout.ts) — shares a fixed lower pane between session info and autocomplete

See [`extensions/README.md`](extensions/README.md) for details and installation.

## Included theme

- [`turquoise`](themes/turquoise.json) — a dark palette that replaces Pi's violet/pink accent family with turquoise and teal

See [`themes/README.md`](themes/README.md) for installation and interaction details.

## Tests

Run `npm test` to check assistant caps, thinking/prose/tool spacing, and compact tool rules without launching Pi.

## Other extensions in use

- [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) — third-party MCP support; replaces Pi's built-in MCP extension
- [`@moguw/pi-session-rename`](https://github.com/Mieluoxxx/pi-ext/tree/main/extensions/pi-session-rename) — third-party automatic session naming
- `herdr-agent-state.ts` — Herdr-managed agent status integration

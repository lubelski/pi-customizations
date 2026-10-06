# Pi customizations

Personal extensions and themes for [Pi](https://github.com/earendil-works/pi).

## Included extensions

- [`assistant-background.ts`](extensions/assistant-background.ts) — gives assistant prose a shaped neutral-gray panel
- [`half-bleed.ts`](extensions/half-bleed.ts) — reshapes message panels and reduces tools to a thin left rule
- [`native-cursor.ts`](extensions/native-cursor.ts) — uses the terminal's native cursor
- [`recessed-tools.ts`](extensions/recessed-tools.ts) — makes tool activity more compact and subdued
- [`session-rename.ts`](extensions/session-rename.ts) — automatically names sessions with concise, scannable topics
- [`session-title-banner.ts`](extensions/session-title-banner.ts) — fixed, centered session title above the fullscreen conversation, with cwd, context token usage, and a muted divider (guarded Pi 1.0.4 layout hook; unsupported renderers show a warning)
- [`stable-input-layout.ts`](extensions/stable-input-layout.ts) — shares a fixed lower pane between session info and autocomplete

See [`extensions/README.md`](extensions/README.md) for details and installation.

## Included theme

- [`turquoise`](themes/turquoise.json) — a dark palette that replaces Pi's violet/pink accent family with turquoise and teal

See [`themes/README.md`](themes/README.md) for installation and interaction details.

## Tests

Run `npm test` to check transcript layout and session-renaming behavior without launching Pi.

## Other extensions in use

MCP uses Pi's native support (`~/.pi/agent/mcp.json` or `.pi/mcp.json`). Remove `pi-mcp-adapter` if installed: registering its `/mcp` command disables native MCP for sessions.

- `herdr-agent-state.ts` — Herdr-managed agent status integration

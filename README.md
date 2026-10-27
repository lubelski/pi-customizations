# Pi customizations

Personal extensions and themes for [Pi](https://github.com/earendil-works/pi).

## Included extensions

- [`assistant-background.ts`](extensions/assistant-background.ts) — gives assistant prose a shaped neutral-gray panel
- [`code-brackets.ts`](extensions/code-brackets.ts) — replaces code fences with plain language labels and muted Unicode bracket rules
- [`half-bleed.ts`](extensions/half-bleed.ts) — reshapes message panels and reduces tools to a thin left rule
- [`recessed-tools.ts`](extensions/recessed-tools.ts) — makes tool activity more compact and subdued
- [`session-rename.ts`](extensions/session-rename.ts) — automatically names sessions with concise, scannable topics
- [`session-title-banner.ts`](extensions/session-title-banner.ts) — fixed, centered session title above the fullscreen conversation, with cwd, context token usage, and a muted divider (guarded Pi 1.0.4 layout hook; unsupported renderers show a warning)
- [`stable-input-layout.ts`](extensions/stable-input-layout.ts) — shares a fixed lower pane between session info and autocomplete

See [`extensions/README.md`](extensions/README.md) for details and installation.

## Copy-friendly assistant messages

Assistant text panels have a small upper-right `‹` trigger in their top border row. Click it to reveal `fmt` and `copy` inline; `›` hides them again. Controls keep full-height background padding, separated by two fractional-height cap characters. The controls start collapsed and preserve their state during message updates. `fmt` toggles between styled Markdown and the original Markdown without panel edges or code-bracket decoration. `copy` is available on every assistant text block and copies its complete source Markdown, including prose and code, rather than decorated terminal rows.

Clicks require fullscreen mode. `/plain-text` targets the last rendered assistant text block as a keyboard fallback. Pi's built-in `/copy` copies the last assistant message. `/copy-code` remains available to copy only that block's code snippets, joined with a blank line. Controls hide at narrow widths rather than overlap content. Body clicks, double-clicks, and drags remain available for selection. This does not change tool output or user-message rendering.

## Included theme

- [`turquoise`](themes/turquoise.json) — a dark palette that replaces Pi's violet/pink accent family with turquoise and teal

See [`themes/README.md`](themes/README.md) for installation and interaction details.

## Tests

Use Node 24+ and Python 3 on macOS or Linux:

```sh
npm ci --ignore-scripts
npm run check
```

Checks run in three layers:

- `npm run typecheck` checks every extension against the pinned Pi API, including editor vs. full UI theme types (Pi 1.2.0).
- `npm test` runs helper tests and real Pi component rendering: custom editor rendering, themes, widths, autocomplete, cursor preservation, footer, and header lifecycle. Runtime tests are mandatory, not silently skipped.
- `npm run test:tui` launches the **bundled CLI** in isolated pseudo-terminals with all extensions installed. It checks startup, two reloads, autocomplete, resize, clean exit, and crash logs in fullscreen/regular modes with turquoise/dark/light themes. It uses a temporary HOME/config/cwd, disables MCP and automatic networking, and makes no model calls. Failure output is saved in `test-artifacts/`.

GitHub Actions runs the same checks on Linux and macOS. Pi dependencies are pinned in `package-lock.json`; upgrade them deliberately and rerun the full suite. To probe another installed Pi runtime, set `PI_PACKAGE_ROOT=/absolute/path/to/@earendil-works/pi-coding-agent` for `npm test` and `npm run test:tui` (typechecking still uses local dependencies).

These checks catch API and rendering crashes, not every visual defect or live-provider interaction. Manually inspect streaming/tool-heavy conversations after renderer changes.

## Other extensions in use

MCP uses Pi's native support (`~/.pi/agent/mcp.json` or `.pi/mcp.json`). Remove `pi-mcp-adapter` if installed: registering its `/mcp` command disables native MCP for sessions.

- `herdr-agent-state.ts` — Herdr-managed agent status integration

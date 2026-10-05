# Extensions

## Installation

Link each extension into Pi's user extension directory:

```sh
mkdir -p "$HOME/.pi/agent/extensions" "$HOME/.pi/agent/lib"
for extension in "$HOME/dev/pi-customizations/extensions/"*.ts; do
  ln -sf "$extension" "$HOME/.pi/agent/extensions/$(basename "$extension")"
done
ln -sfn "$HOME/dev/pi-customizations/lib" "$HOME/.pi/agent/lib/pi-customizations"
```

After installing or updating an extension, run `/reload` inside Pi.

## `assistant-background.ts`

Gives assistant prose an adaptive neutral-gray panel while leaving thinking text unboxed. Dark and light themes receive different grays to preserve contrast. The panel uses the same half-cell sides and partial-height caps as the user-message treatment. Thinking that leads directly into a tool gets the same separator spacing as thinking followed by prose.

Pi does not expose a public renderer for built-in assistant messages. This experiment uses the current component structure: prose is a direct Markdown child, while thinking is wrapped separately. It should fail harmlessly if that structure changes.

## `half-bleed.ts`

Shapes transcript panels without changing their terminal-cell layout:

- user and custom messages retain their filled backgrounds with half-cell side edges;
- their top and bottom caps occupy one third of a row;
- their corner cells use individual sextants for exact square intersections;
- tool panels lose their filled background and right edge, leaving one thin, very low-contrast left rule;
- the tool rule starts and ends with rendered tool content rather than extending through box padding;
- Pi's standalone pre-tool separator is removed to tighten the transition from assistant prose;
- tool errors use an error-colored left rule.

The side edges use standard Unicode Block Elements. The caps and corners require support for the Symbols for Legacy Computing sextants.

## `native-cursor.ts`

Removes Pi's reverse-video software cursor while preserving the cursor marker used to position the terminal's native cursor. The extension does not choose the native cursor's shape; that remains a terminal setting.

This extension requires Pi's hardware cursor to be enabled. Set `"showHardwareCursor": true` in `~/.pi/agent/settings.json` or launch Pi with `PI_HARDWARE_CURSOR=1`. Otherwise the extension removes Pi's software cursor while Pi keeps the terminal cursor hidden, leaving no visible cursor.

## `recessed-tools.ts`

Makes tool activity secondary to the assistant's prose while preserving access to its details:

- collapsed tool panels show at most seven lines, retaining both their beginning and end;
- expanding a tool still reveals the complete component;
- tool titles and output use the theme's dim text color;
- errors remain visually distinct;
- image results are not truncated.

## `session-rename.ts`

Automatically names a session from the user's conversation after the first user-agent turn, then refreshes the generated name every five turns. Generated names contain only a concise topic so they remain easy to scan in the footer and session picker. Manual names are never overwritten.

Commands:

```text
/rename                  Generate a topic now
/rename "Custom topic"   Set a manual name
/rename settings         Configure model, thinking level, and timing
```

Settings are stored in `~/.pi/agent/rename.json`. `afterSteps: 0` disables automatic naming; `everySteps: 0` names a session only once. An empty `model` uses the current session model.

This extension is adapted from [`@moguw/pi-session-rename`](https://github.com/Mieluoxxx/pi-ext/tree/main/extensions/pi-session-rename) under the MIT license. Remove that package before enabling this version so its `/rename` command and automatic naming handler do not run twice:

```sh
pi remove npm:@moguw/pi-session-rename
```

## `stable-input-layout.ts`

Keeps a seven-row pane below the editor so the input and transcript remain anchored:

- while idle, the pane shows unlabeled project, usage, context, model, MCP servers, active visual extensions, and conversation title values on separate lines;
- the MCP row names each enabled server without an icon, using `pi-mcp-adapter`'s runtime snapshot or active namespace tools;
- visual extensions announce themselves through scoped footer statuses, so only customizations loaded in the current session appear;
- the first row right-aligns live run/queue state plus a compact reminder: `↵` steers the next turn, `⌥↵` queues work after the task, and `⌥↑` returns the queue to the editor for revision;
- the conversation title always occupies the bottom line;
- topic-only names remain prominent and left-aligned for scanning;
- legacy `MMDD｜TYPE｜Topic` names display as a prominent `Topic`, with metadata such as `REL · Nov 12` dimmed and right-aligned using the session start date in `America/Los_Angeles`;
- while autocomplete is open, up to six choices plus its scroll indicator replace the session information in the same space;
- short autocomplete lists are padded to the same height, so filtering does not move the input;
- the terminal's native cursor customization continues to compose with the custom editor.

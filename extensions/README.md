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

## `recessed-tools.ts`

Makes tool activity secondary to the assistant's prose while preserving access to its details:

- collapsed tool panels show at most seven lines, retaining both their beginning and end;
- expanding a tool still reveals the complete component;
- tool titles and output use the theme's dim text color;
- errors remain visually distinct;
- image results are not truncated.

## `stable-input-layout.ts`

Keeps a six-row pane below the editor so the input and transcript remain anchored:

- while idle, the pane shows unlabeled project, usage, context, model, extension status, and conversation title values on separate lines;
- when `pi-mcp-adapter` publishes its runtime snapshot, the status row names each enabled MCP server instead of showing only a count;
- the first row right-aligns live run/queue state plus a compact reminder: `↵` steers the next turn, `⌥↵` queues work after the task, and `⌥↑` returns the queue to the editor for revision;
- the conversation title always occupies the bottom line;
- structured `MMDD｜TYPE｜Topic` names display as a prominent `Topic`, with `TYPE · MMDD` dimmed and right-aligned using the session's local start date;
- while autocomplete is open, up to five choices plus its scroll indicator replace the session information in the same space;
- short autocomplete lists are padded to the same height, so filtering does not move the input;
- the terminal's native cursor customization continues to compose with the custom editor.

# Extensions

## Installation

Link each extension into Pi's user extension directory:

```sh
mkdir -p "$HOME/.pi/agent/extensions" "$HOME/.pi/agent/lib"
for extension in "$HOME/dev/pi-customizations/extensions/"*.ts; do
  ln -sf "$extension" "$HOME/.pi/agent/extensions/$(basename "$extension")"
done
for helper in "$HOME/dev/pi-customizations/lib/"*.ts; do
  ln -sf "$helper" "$HOME/.pi/agent/lib/$(basename "$helper")"
done
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

## Native cursor (built into Pi 1.2)

Set `"showHardwareCursor": true` in `~/.pi/agent/settings.json`. Pi now removes its software cursor itself; the terminal controls the native cursor shape. The former `native-cursor.ts` extension is retired. Remove its installed symlink and any explicit settings entry when upgrading.

## `recessed-tools.ts`

Makes tool activity secondary to the assistant's prose while preserving access to its details:

- completed, collapsed tools occupy one muted row: tool name plus a path, command, query, or URL when available; scripts and payloads stay hidden;
- clicking that row or using Pi's native expand shortcut opens a ten-row text preview, plus the summary and control rows;
- click `+10 more` to grow the preview incrementally, or `show all` to restore native full output (including images);
- click the summary again to collapse; reopening starts at ten rows, and preview-body clicks do not unexpectedly change its size;
- `/tool-detail more|all|collapse` controls the last opened/clicked tool; Ctrl+O followed by this command provides a keyboard path (when opening several tools, it targets the last one);
- image output stays hidden until `show all`, so image escape sequences are never clipped;
- running tools retain their native previews;
- tool titles and output use the theme's dim text color;
- failed tools use an error-colored row with a failure marker;
- saved results and model context are unchanged.

This uses a guarded component render/input patch because tool renderers alone do not control Pi's separately appended images. Completed tools own their header/control hit areas; previews use native text components without images, and full disclosure uses native rendering. Running tools retain native input. Reloading does not stack the wrappers.

## `session-rename.ts`

Automatically names a session from the conversation after the first user-agent turn, then refreshes the generated name every five turns. Generated names contain only a concise topic so they remain easy to scan in the footer and session picker. When the initial request links to a GitHub pull request, Linear ticket, or similar work item, the name uses its human-readable title when the conversation or retrieved tool context provides it instead of relying on the item ID alone. Each generated refresh receives the previous title as a continuity anchor: preserve its core topic, keep it unchanged when still accurate, and broaden it only when the session's goal warrants it rather than chasing the latest subtask. Manual names are never overwritten.

Commands:

```text
/rename                  Generate a topic now
/rename "Custom topic"   Set a manual name
/rename settings         Configure model, thinking level, and timing
```

Settings are stored in `~/.pi/agent/rename.json`. `afterSteps: 0` disables automatic naming; `everySteps: 0` names a session only once. The default naming model is `openai-codex/gpt-5.6-luna`; an empty `model` falls back to that model.

This extension is adapted from [`@moguw/pi-session-rename`](https://github.com/Mieluoxxx/pi-ext/tree/main/extensions/pi-session-rename) under the MIT license. Remove that package before enabling this version so its `/rename` command and automatic naming handler do not run twice:

```sh
pi remove npm:@moguw/pi-session-rename
```

## `stable-input-layout.ts`

Keeps a seven-row collapsed pane below the editor so the input and transcript remain anchored:

- while idle, the pane shows project, usage, context, model, task links, MCP servers, and active visual extensions;
- the agent-facing `set_footer_links` tool replaces the session's clickable task links, with short labels for resources such as Linear tickets, local mock or Storybook pages, and pull requests;
- task links are branch-local session state, survive resume and reload, and can be cleared by setting an empty list;
- `set_task_workspace({ path: "/absolute/task/directory" })` updates `F`, `B`, and `WT` together when the agent claims or switches worktrees; it uses Git metadata, not worktree naming conventions. This is display-only: tool cwd, relative path resolution, and the title banner's session directory are unchanged;
- the workspace selection survives resume/reload on the active session branch. Git metadata refreshes after each agent run; detached HEAD displays `B: -`. Pass `path: null` to restore the session directory. Missing saved directories fall back to the session directory. Shell `cd` and incidental reads do not implicitly select a workspace;
- location (`F:`, `B:`, `WT:`), usage (`U:`), context (`C:`), and model (`M:`) stay left; queue guidance stays right in an equal-width column;
- unprefixed links are right-aligned and bottom-anchored on the model row, one line above the final summary/relay row; they wrap upward across up to three existing rows alongside usage, context, and model; overflow ends in an ellipsis rather than increasing footer height;
- the final left-aligned row combines inventory counts: `E: 2x MCP servers, 5x extensions (alt+i to expand)`; this row can use the full width;
- `Alt+I` (or `/inventory`) toggles the full inline list below the summary, labeled MCP or EXT, with reported MCP status when available; expanded entries wrap across the available width rather than truncating the list;
- expansion intentionally grows the dock; collapse restores seven rows, and reload starts collapsed; autocomplete temporarily hides the inventory;
- the MCP status names servers with registered, non-hidden tools, including native codemode and deferred tools; names are deduplicated, and legacy `pi-mcp-adapter` snapshots remain supported (this is not a connection-health indicator);
- EXT automatically groups available non-built-in tools and extension commands by their source package or extension filename, alongside UI customizations that publish scoped footer statuses; web access, the journal, and future tool/command packages do not need custom footer integration;
- inactive direct tools and hidden tools are excluded; codemode/deferred tools remain available and count, while MCP tools stay in the MCP list; built-ins, skills, prompt templates, and external CLIs are not extension inventory entries;
- hook-only extensions without tools, commands, or a scoped status cannot be discovered through these public APIs; counts describe discoverable providers, not a complete installed-extension inventory or connection-health check; the list refreshes from runtime metadata on each render;
- the top three right-side rows wrap live run/queue state plus a compact reminder: `↵` steers the next turn, `⌥↵` queues work after the task, and `⌥↑` returns the queue to the editor for revision;
- while autocomplete is open, up to six choices plus its scroll indicator replace the collapsed session information in the same space;
- short autocomplete lists are padded to the same height, so filtering does not move the input;
- the custom editor preserves the cursor marker for Pi's built-in native cursor handling.

# README screenshots

Both PNGs show the bundled Pi 1.2.0 CLI rendering the same synthetic JSONL session in a 110-column × 42-row pseudo-terminal, in fullscreen mode.

- `pi-stock.png`: built-in `dark` theme with `--no-extensions`.
- `pi-customized.png`: `turquoise` theme and this repository's extensions.

The terminal's actual ANSI output was replayed in xterm.js 6.0.0 with its WebGL renderer, then captured with agent-browser at 928 × 804 pixels. Font: Menlo with Noto Sans Symbols 2 fallback for the panel-edge Unicode glyphs. Both images use the same terminal background, font size, and viewport; no UI elements were redrawn or retouched.

The demo uses an isolated HOME, agent configuration, and project directory. MCP, context files, skills, prompt templates, and automatic networking were disabled. A placeholder API key made the selected model available in the UI; no model requests were made. The conversation, tool result, and usage figures are synthetic, not evidence of an executed coding task or model performance.

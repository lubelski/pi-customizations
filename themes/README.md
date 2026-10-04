# Themes

## Installation

Link the theme into Pi's user theme directory:

```sh
mkdir -p "$HOME/.pi/agent/themes"
ln -sfn \
  "$HOME/dev/pi-customizations/themes/turquoise.json" \
  "$HOME/.pi/agent/themes/turquoise.json"
```

Select `turquoise` through `/settings`, then run `/reload`.

## `turquoise`

A dark theme based on Pi's built-in dark palette. It keeps blue user-message panels, neutral body text, semantic green/yellow/red states, and replaces the violet/pink family used by accents, active borders, inline code, list bullets, custom messages, syntax types, and thinking levels with turquoise and teal.

The custom extensions compose with the theme as follows:

- assistant prose uses its own adaptive neutral-gray panel;
- user messages use the theme's blue `userMessageBg`;
- tool rules mix the theme's `toolPendingBg` and `borderMuted`;
- footer run state uses the theme's teal `accent`;
- ordinary footer text uses the theme's neutral `text` and `dim` colors.

Unlike Pi's `system` theme, this palette is Pi-specific and does not derive hues from the terminal's ANSI colors.

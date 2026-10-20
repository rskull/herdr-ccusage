# herdr-ccusage

A [herdr](https://herdr.dev) plugin that shows each Claude Code session's cost and token usage, computed by [ccusage](https://github.com/ryoppippi/ccusage), right in the herdr sidebar.

## How it works

For every Claude Code pane, the plugin looks up the pane's session ID with `herdr agent list`, asks `ccusage session --id <id>` for that session's totals, and reports them as pane metadata tokens:

| Token | Example | Meaning |
|---|---|---|
| `$cc_cost` | `$1.35` | Estimated session cost in USD |
| `$cc_tokens` | `2.0M` | Total tokens (input, output, cache) |

Values refresh:

- on herdr startup, for all panes
- when an agent turns `idle`, `done`, or `blocked`, for that pane
- from the action **ccusage: refresh session costs**, for all panes

<img width="184" height="137" alt="screenshot" src="https://github.com/user-attachments/assets/5539d1dd-ce5e-4f8a-9f7a-a301eb42f78f" />

## Requirements

- herdr 0.9.0 or later
- Node.js (with `npx`)
- macOS or Linux

ccusage runs through `npx -y ccusage@20.0.37`, so it does not need to be installed. The first run may be slow while npx downloads it.

## Install

```sh
herdr plugin install rskull/herdr-ccusage
```

## Show the cost in the sidebar

herdr does not show pane tokens until a sidebar row asks for them. Add `$cc_cost` and `$cc_tokens` to your Agent rows in `~/.config/herdr/config.toml`:

```toml
[ui.sidebar.agents]
rows = [
  ["state_icon", "machine", "workspace", "tab"],
  ["agent", { token = "$cc_cost", fg = "#EBCB8B", bold = true }, { token = "$cc_tokens", fg = "#EBCB8B" }],
]
```

The first row is herdr's default. If you already customize `rows`, add the two tokens to your own layout instead. Then reload:

```sh
herdr server reload-config
```

To fill in values right away instead of waiting for the next turn, run:

```sh
herdr plugin action invoke refresh --plugin rskull.ccusage
```

## Configuration

| Environment variable | Default | Purpose |
|---|---|---|
| `HERDR_CCUSAGE_CMD` | `npx -y ccusage@20.0.37` | Command used to run ccusage, e.g. `ccusage` if it is installed globally |

## Troubleshooting

```sh
herdr plugin log list --plugin rskull.ccusage
```

The plugin also writes a `refresh.log` to its state directory with one line per pane update or ccusage failure.

## Limitations

- Costs are ccusage estimates from local logs and list prices, not your actual bill.
- Only Claude Code panes are supported.
- A session with no usage logged yet shows `$0.00`.

## Uninstall

```sh
herdr plugin uninstall rskull.ccusage
```

Remove the `$cc_cost` and `$cc_tokens` entries from your sidebar rows.

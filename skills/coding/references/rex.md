# Rex for coding sessions

This file covers the Rex commands that a coding session needs. For layouts, app control, and other Rex tasks, run `rex __internal skill` and follow the guide that it prints. Do not invent Rex commands.

## Identify your location

Rex sets `REX_SESSION` and `REX_BLOCK` in each terminal that it opens. `REX_BLOCK` is your own pane: never send input to it. If `REX_SESSION` is not set, run `rex whoami --json` and `rex ls --json`, then select the session that matches the request.

To work on another machine, put `-S HOST` before the subcommand, for example `rex -S MacMini run ...`. Paths and programs must exist on that machine.

## Commands

| Action                                       | Command                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| Open a tab that runs a command               | `rex run -s S -c DIR --label L --keep-open --focus=false --json -- CMD...` |
| Read a pane                                  | `rex capture -s S -b B --trim \| tail -n 40`                               |
| Paste text into a pane                       | `rex send -s S -b B 'TEXT'`                                                |
| Press a key (`enter`, `down`, `esc`, ...)    | `rex send-key -s S -b B enter`                                             |
| Wait up to N seconds, or until the CLI exits | `rex wait -s S B --for 60s 2>/dev/null                                     |
| Close a tab                                  | `rex window close -s S WINDOW`                                             |

`rex run --json` returns `.block_ids[0]` (the pane) and `.window_id` (the tab):

```sh
out=$(rex run -s "$REX_SESSION" -c "$project_dir" --label Coding --keep-open --focus=false --json -- CMD...)
block=$(jq -r '.block_ids[0]' <<<"$out")
window=$(jq -r '.window_id' <<<"$out")
```

Shell variables do not persist between separate tool calls. Record the full IDs and pass them directly in later calls.

## Gotchas

- **A new tab uses the login shell environment.** It does not load `~/.zshrc`, so shell functions such as `cc` and the variables that they set are not available. Start a CLI through `zsh -ic 'CMD "$1"' zsh ARG`.
- **`rex wait --for` exits with status 1 when the time runs out.** Add `2>/dev/null || true` so that a normal poll does not show as an error. If it returns before the time runs out, the program in the pane exited. Use the returned exit status.
- **`rex wait` cannot wait for text.** To detect when a CLI is ready or idle, poll with `rex wait --for` and `rex capture`.
- **`rex send` pastes text without submitting it.** Multi-line text stays in the input box. Capture to confirm the text, then send `enter`.
- **In a menu, `enter` selects the item at the `❯` cursor.** Capture to confirm the cursor position before you press `enter`.
- **A timeout does not mean failure.** Inspect the state before you retry a command, so that you do not open a duplicate tab.
- **`--keep-open` keeps the pane after the program exits,** so that you can read a startup error. Close the tab when you are done.

# Claude Code in Rex

Run Claude Code through the `cc` shell function. `cc` sets the API endpoint and the credentials, then runs `claude` with the arguments that you pass. Do not run `claude` directly: it does not get the credentials. Never print, pass as arguments, or write the credential values.

Models: `fable`, `opus`, `sonnet`, `haiku`. Pass `--model NAME --effort LEVEL`.

## Print mode: advisor, explorer, reviewer

A read-only role runs one turn in print mode and exits. Write the message to a file and pass it on standard input:

```sh
out=$(rex run -s "$REX_SESSION" -c "$project_dir" --label Review --keep-open --focus=false --json \
  -- zsh -ic 'cc -p --model "$1" --effort "$2" --disallowedTools Edit,Write,NotebookEdit < "$3"' \
  zsh "$model" "$effort" "$message_file")
```

**`--disallowedTools` takes several values.** If the message follows it on the command line, Claude Code reads the message as a tool name and fails with `Input must be provided either through stdin or as a prompt argument`. Always pass the message on standard input.

Then wait for the exit status and read the answer, as for pi:

```sh
rex wait -s "$REX_SESSION" "$block" --for 120s --json 2>/dev/null || true
rex capture -s "$REX_SESSION" -b "$block" --trim | tail -n 80
```

`{"exit_code":0}` means that the turn finished. A non-zero `exit_code` means an error: read it in the capture. A timeout with no `exit_code` means that the role still works.

## Interactive mode: worker

A Claude worker runs interactively, so that you can supervise it and send review findings in the same session:

```sh
out=$(rex run -s "$REX_SESSION" -c "$project_dir" --label Coding --keep-open --focus=false --json \
  -- zsh -ic 'cc --model "$1" --effort "$2"' zsh "$model" "$effort")
```

Wait about 8 seconds, then capture the pane:

- **Folder trust prompt.** Claude Code asks whether you trust the folder. The cursor `❯` starts on `No, exit`. Accept only for the repository that the user asked you to work on: press `down`, capture to confirm that `❯` is on `Yes, I trust this folder`, then press `enter`.
- **Ready.** The banner shows the model, for example `Sonnet 5.5`, above an empty `❯` input box. The effort shows in the banner (`with high effort`) or above the input box (`◐ medium · /effort`). Confirm both.
- **Failure.** `cc: command not found`, authentication errors, model errors, or an early exit. Report the captured error and stop.

Paste the whole task message with `rex send`, capture to confirm it, then press `enter`. Do not ask the worker to read a message file outside the repository: that triggers a permission prompt.

### Busy and idle

While Claude Code works, its status line shows `esc to interrupt`. When it waits for input, that text is not there.

```sh
rex wait -s "$REX_SESSION" "$block" --for 30s 2>/dev/null || true
rex capture -s "$REX_SESSION" -b "$block" --trim | tail -n 40
```

When it is idle, read the screen. It finished, asks a question, or shows a permission prompt. Permission prompts are menus: confirm the `❯` position before you press `enter`.

### Exit

Send `/exit`, then press `enter`. Then close the tab with `rex window close`.

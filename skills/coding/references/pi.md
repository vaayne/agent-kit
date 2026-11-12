# pi in Rex

Run pi in print mode (`pi -p`). Each turn is one process: it reads the message, does the work, prints the final answer, and exits. Rex shows the run in a tab, and the exit status tells you when the turn is done.

Models: `openai-codex/gpt-6-astra`, `openai-codex/gpt-6-luna`, `openai-codex/gpt-6.1-terra`, `openai-codex/gpt-6.1-sol`, `pdx/deepseek-flash`. Pass `--model ID --thinking LEVEL`. For another model, run `zsh -ic 'pi --list-models SEARCH'`. Do not invent an ID.

**The list is a catalog, not proof of availability.** A listed model can still fail on the first request. For example, a proxy returns `404 model ... is not available`, names the models that it serves, and pi exits with status 1.

## Read-only roles: advisor, explorer, reviewer

Write the message to a file. `@FILE` sends the file contents as the message. `--exclude-tools edit,write` removes the edit tools, and `--no-session` keeps no session:

```sh
out=$(rex run -s "$REX_SESSION" -c "$project_dir" --label Review --keep-open --focus=false --json \
  -- zsh -ic 'pi -p --no-session --exclude-tools edit,write --model "$1" --thinking "$2" @"$3"' \
  zsh "$model" "$thinking" "$message_file")
```

## Worker

Choose a session ID, so that later turns continue the same conversation:

```sh
sid="coding-$(uuidgen | tr A-Z a-z | cut -c1-8)"
out=$(rex run -s "$REX_SESSION" -c "$project_dir" --label Coding --keep-open --focus=false --json \
  -- zsh -ic 'pi -p --model "$1" --thinking "$2" --session-id "$3" @"$4"' \
  zsh "$model" "$thinking" "$sid" "$message_file")
```

On the first turn, pi prints `No project session found with id ...; creating a new session`. This warning is expected.

For each later turn, close the previous tab, write the review findings to a file, and run the same command with the same model, thinking level, and session ID. pi keeps the context of the earlier turns.

## Wait for the result

```sh
rex wait -s "$REX_SESSION" "$block" --for 120s --json 2>/dev/null || true
rex capture -s "$REX_SESSION" -b "$block" --trim | tail -n 80
```

- `{"exit_code":0}`: the turn finished. The capture ends with pi's final answer.
- A non-zero `exit_code`: read the error in the capture.
- A timeout with no `exit_code`: pi still works. Wait again, and capture at each wait to look for errors.

## Close

When the work is accepted, close the last tab with `rex window close` and delete the message files.

# Claude worker in ccvm

`ccvm` runs Claude Code in a Linux container (apple/container) on an APFS copy-on-write clone of the repository. The worker runs with `--dangerously-skip-permissions`: it does not stop at permission prompts, and it cannot change the user's checkout. You bring its result back as a patch.

## When to use it

Use a ccvm worker when one of these is true:

- The user asks for ccvm, a container, or isolation.
- Two or more workers change the same repository at the same time.
- The task is a long unattended run, where permission prompts would stop a host worker.

Otherwise use a host worker. Do not use ccvm when:

- The repository is not a git checkout.
- The task needs macOS: Xcode, a macOS app build, the Keychain, or host services.
- `command -v ccvm` fails, or `container` is not installed on the machine.

Only Claude models run in ccvm. Read-only roles stay on the host.

## What the container has

- The clone at `/work/<repo>`, on the branch `ccvm/<task>`. It has the tracked files and the untracked files that git does not ignore, with the user's uncommitted changes. Ignored files, such as `node_modules`, build output, and `.env`, are not in it. The worker installs Linux dependencies in the container.
- The host CLAUDE.md, settings, skills, agents, and rules.
- mise tools, gh, op, and nmem. Network access is not restricted.
- git and gh act as v-elves[bot] when the app is installed on the repository. The task message still forbids commits and pushes.

## Start

Choose a task name that matches `[a-z0-9-]` and is not in `ccvm ls`, for example `coding-auth-fix`:

```sh
out=$(rex run -s "$REX_SESSION" -c "$project_dir" --label Coding --keep-open --focus=false --json \
  -- zsh -ic 'ccvm -n "$1" --rm --model "$2" --effort "$3"' zsh "$task" "$model" "$effort")
```

ccvm copies the repository and starts the container in about 10 seconds. There is no folder trust prompt. Then supervise the worker as described in [claude-code.md](claude-code.md): confirm the banner, paste the task message, and poll.

## Review and apply the result

Run these in `project_dir` on the host. `ccvm diff` finds the clone from the source directory and the task name:

```sh
ccvm diff "$task" --stat
ccvm diff "$task"
```

The diff has only the changes that the task made, new files included. The user's uncommitted changes that ccvm copied at the start are not in it. Send your findings to the worker as usual.

To run a check before you apply, run it in the container. The working directory is `/work/<repo>`:

```sh
ccvm sh "$task" <<<'pnpm test'
```

Apply the diff once, after the last review round. The diff is cumulative, so a second apply fails:

```sh
ccvm diff "$task" --binary | git -C "$project_dir" apply
```

If a hunk does not apply, for example because the user changed the same lines after the start, `git apply` changes no file. Report it, and do not force it. Then verify on the host, where the macOS dependencies are.

## Close

Send `/exit`, then press `enter`. With `--rm`, ccvm deletes the container, prints the clone state, and asks `Delete the clone? [y/N]`. Answer `y` only after you applied the diff, or after the user rejected the work. Otherwise answer `n` and report the clone path, `~/.agents/worktrees/<repo>/<task>`. Then close the tab.

The worker's session stays in `~/.claude/projects` with the host sessions of the source repository. Claude Code prints a `claude ... --resume ID` line when it exits; that command works only inside the container.

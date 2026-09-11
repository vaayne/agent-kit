---
name: devin-cli
description: >
  Delegate an implementation task to the Devin CLI as an external process.
  Codex only: use when the Codex parent assigns implementation work to Devin.
  Not for review-only, explanation, or search tasks.
---

# Devin CLI delegation (Codex only)

If you are already running inside Devin, do the delegated work yourself; never
launch Devin recursively.

## Dispatch

From the assigned workspace, run:

    devin --permission-mode dangerous --respect-workspace-trust false --prompt-file <absolute-task-file> --export <absolute-session-log> -p

The user pre-authorizes these settings for Codex-dispatched runs; do not re-ask.
Omit `--model` unless the user requests one, so Devin keeps its configured
model. Stay within the assigned scope.

Write a self-contained task file: workspace, objective, acceptance criteria,
allowed files, existing changes to preserve, required checks, and the return
evidence you want (changed files, behavior changes, verification results,
unresolved risks). Tell Devin not to commit, push, publish, or delegate further
unless explicitly assigned. Keep task and log files in a task-specific scratch
directory outside the files being changed. Do not copy unrelated secrets into
the brief.

## Manage

Track the CLI process handle with bounded waits. It is an external process, not
a native Codex subagent; native subagent concurrency limits do not apply. For
parallel implementation runs, assign disjoint file ownership.

## Recover

On interruption or partial failure, inspect the actual diff before retrying.
Resume the specific session with `--resume <session-id>` when appropriate; do
not blindly `--continue` or start duplicate work. Report failures; never
silently fall back to Sol or another implementer.

## Verify

The parent owns integration and final verification: check the real diff and
check evidence. A clean exit or a confident summary alone does not prove
completion.

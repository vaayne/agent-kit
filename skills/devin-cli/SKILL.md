---
name: devin-cli
description: Delegate implementation to Devin when a Codex parent assigns it. Route through bb inside bb, or the direct CLI outside bb. Not for review, explanation, or search.
---

# Devin CLI delegation

If you are already running inside Devin, do the delegated work yourself; never
launch Devin recursively.

## In bb

Use bb orchestration, not the CLI below: spawn a child thread on the Devin
provider with `bb thread spawn` and the task brief described under Dispatch.
Follow bb orchestration rules for provider selection and permissions — Devin
keeps its configured default model, use `--permission-mode full` where the
platform allows, and do not apply Codex-specific flags to a Devin thread.

## Dispatch (outside bb)

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

Track the CLI process or bb thread handle with bounded waits. It is an
external worker, not a native subagent; native subagent concurrency limits do
not apply. For parallel implementation runs, assign disjoint file ownership.

## Recover

On interruption or partial failure, inspect the actual diff before retrying.
Inside bb, resume the existing child with bb thread commands. Outside bb,
resume the specific CLI session with `--resume <session-id>` when appropriate;
do not blindly `--continue` or start duplicate work. Report failures; never
silently fall back to another implementer.

## Verify

The parent owns integration and final verification: check the real diff and
check evidence. A clean exit or a confident summary alone does not prove
completion.

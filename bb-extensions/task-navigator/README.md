# Task Navigator

Task-first navigation for BB:

```text
Task → thread tree
```

A task is the durable intent. Threads are attempts attached below it. The
plugin derives who should act next from task threads, comments, and pull
requests instead of trusting a manually maintained status.

## Install

From this checkout:

```sh
bb plugin install ./bb-extensions/task-navigator --yes
```

Then select **Task Navigator** in **Settings → Appearance → Sidebar**. The
plugin also adds an **inbox** panel and a **全景** fixed tab.

## Sidebar

The sidebar has three quiet sections:

- **轮到你** shows tasks with a pending interaction, a completed PR, no
  threads, or another missing handoff.
- **在跑** shows tasks with active thread work.
- **其它** folds waiting and stalled work, plus root threads not yet filed to a
  task.

Task rows show the key, title, the first 40 characters of `next`, and coarse
relative age. Expanding a row shows its thread tree and pull requests. Search
matches task key, title, `next`, and thread titles. Project filters use the task
key prefix and persist in this browser.

Child threads automatically inherit their parent's task. Agents receive the
task key and the handoff convention through `bb.agents.configure`.

## Panels and actions

- **收件箱** shows one actionable task at a time. The rest collapse to **还有
  N 件**. It can open a thread, open a PR, or write a `Next:` comment.
- **全景** groups active work into **等你 / 在跑 / 停了没 next / 等 CI / 等别人**
  and offers a confirm-before-archive action for stalled tasks untouched for
  30 days.
- **所属 task** is available from an existing thread's panel. It shows the
  task handoff, sibling threads, PRs, and the last agent sentence, and supports
  re-binding or promoting an unfiled thread.
- **先建 task** is available from the new-thread panel. It creates a task and
  delegates the first thread in one action.

The latest task comment whose first line starts with `Next:` or `Next：` is the
current handoff. `Next: none` means there is no next step.

## Development

```sh
cd bb-extensions/task-navigator
npm install
npm run typecheck
npm test
bb plugin build .
```

Generated bundles live in `dist/` and are intentionally ignored.

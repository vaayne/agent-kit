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
plugin also adds a **全景** board page with a **收件箱** fixed tab.

## Sidebar

The sidebar answers one question: where do I click next. Three layers, and
nothing else by default:

- **PMO**: a dashed row for the standing PMO thread (setting `pmoThreadId`).
- **Now**: one compact attention shelf. Tasks needing you come first, followed
  by unread agent results, results opened within the last 30 minutes, running
  tasks, and finally the task that owns the thread you are in. Workflow state
  stays independent: an unread result can bring a waiting, stalled, or done
  task back into Now without moving its board column. Each row: status icon,
  key, title, one reason word, age. Icons, by urgency: amber question mark
  (agent asking), red exclamation (thread errored), spinning arc (running), dot
  (unread since you last opened it). The section disappears when it is empty.
- **Scratch**: root threads from the last 7 days not filed under a task,
  newest first. One-off work lives here and never needs a task; hover a row
  for "Make a task". Six rows by default, expand to all.
- **More**: folded, no counts. Inside, small groups Waiting / Stalled / Not
  started / Recently done. Search expands it automatically.

There is no project filter in the sidebar: the task key prefix on every row is
the project, and typing `AK-` in search filters by it. The board keeps project
chips. Expanding a task row shows its thread tree and pull requests; archived
threads are dimmed and still open.

A one-line usage footer ("Claude 42% · Codex 6%") sits under the list, above
Settings. Click it for per-window detail; the data comes from BB's primary
machine, cached 30 seconds.

## Language

All strings live in `src/strings.ts` (`zh` and `en`). The `language` setting
picks one; `auto` (default) follows the browser. Derived reasons are codes
(`asking`, `ciFailed`, …) so every surface renders them in the chosen language.

Child threads automatically inherit their parent's task. Agents receive the
task key and the handoff convention through `bb.agents.configure`.

## Panels and actions

- **全景** is a board whose columns are derived attention states, never the
  manual status: **等你 / 在跑 / 等 CI·等别人 / 停了 / 未开始 / 最近完成**. Cards
  move when facts change; nothing is dragged. It offers a confirm-before-archive
  action for stalled tasks untouched for 30 days; the server re-derives the
  candidate list so a stale page cannot cancel live work.
- **收件箱** (fixed tab beside the board) consumes the same attention set as
  Now, excluding running/current-only rows, and shows one task at a time. The
  rest collapse to **还有 N 件**. Its button follows the reason: answer the
  asking thread, open the open PR, open the exact thread with a new result, or
  write a `Next:` comment. Opening an unread result marks it read only after a
  30-minute return-to-it retention record is stored in this browser.
- **所属 task** is available from an existing thread's panel. It shows the
  task handoff, sibling threads, PRs, and the last agent sentence, and supports
  re-binding (detaches from the previous task) or promoting an unfiled thread.
- **先建 task** is available from the new-thread panel. It creates a task in
  the tracker project linked to the selected BB project (Personal when none is
  selected) and delegates the first thread with the preset named in the
  plugin's **Delegation preset** setting (default `Luna`).

The latest task comment whose first line starts with `Next:` or `Next：` is the
current handoff. `Next: none` means there is no next step.

## Time and status history

Tasks only store `createdAt`, so the overview derives the rest: `startedAt` is
the first thread attachment, `doneAt` is recorded by the plugin when it first
observes `status = done` (kv key `status-log`; tasks finished before the plugin
ran fall back to `updatedAt`). Every observed status change also posts a
comment `Status: a → b` on the task, so the trail survives a kv reset. The
board header shows the median created-to-done cycle over 最近完成.

## PMO

The PMO lives in BB's **Personal** project (`proj_personal`, tracker prefix
`PERSONAL`), never in a code project: it manages tasks across every project,
while agent-kit only hosts this plugin's source and its own implementation
tasks (`AK-*`). `scripts/pmo-instructions.md` is its standing brief (spawned
once with `bb thread spawn --project proj_personal --provider pi --model
cpa/gpt-5.6-luna --permission-mode full --title PMO --prompt "$(cat …)"`;
the pi provider accepts only `full`, then `bb plugin config task-navigator set pmoThreadId <thr_…>`).
A `bb automation … --target-thread <thr_…>` sends "巡检" into it on a cron.
BB automations cannot be created in the Personal project (`--project
proj_personal` returns 404), so the schedule is hosted in agent-kit as a
timer only; the thread it targets, and every comment it writes, stay in
Personal. Move the automation once BB allows it. the thread runs `scripts/pmo-sweep.py --apply`
by absolute path (its cwd is not this repo), which is the deterministic half:

| Rule                                           | Action                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| every PR merged, no live thread, status ≠ done | mark done + comment                                                           |
| `Next:` older than 3 days                      | listed for the agent to nudge or rewrite                                      |
| stalled (no `Next:`)                           | listed with the primary thread; the agent reads its output and writes `Next:` |
| stalled > 30 days                              | listed for V; never canceled automatically                                    |

The script never cancels or deletes; ask the PMO thread anything about tasks
between sweeps.

## State table

| Facts                                      | Group                       | Reason              |
| ------------------------------------------ | --------------------------- | ------------------- |
| status done / canceled                     | none (最近完成 for 30 days) | 已结束              |
| no threads, status backlog / todo          | backlog                     | 未开始              |
| no threads, status in_progress / in_review | stalled                     | 没有线程记录        |
| a thread is asking or errored              | you                         | agent 在问你        |
| a thread is running                        | running                     | agent 正在工作      |
| open PR with pending checks                | waiting (ci)                | PR CI 运行中        |
| open PR with failing checks                | you                         | PR CI 失败          |
| open PR otherwise                          | you                         | 等你 review         |
| idle, no `Next:`                           | stalled                     | 线程停了，没有 next |
| idle, has `Next:`                          | waiting (agent)             | 等待 agent 的下一步 |

Draft PRs do not count as open; they fall through to the `Next:` rules.

## Development

```sh
cd bb-extensions/task-navigator
npm install
npm run typecheck
npm test
cd ../.. && bb plugin build ./bb-extensions/task-navigator && bb plugin reload task-navigator
```

Generated bundles live in `dist/` and are intentionally ignored.

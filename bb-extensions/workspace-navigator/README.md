# Workspace Navigator

A sidebar replacement for BB that keeps the relationship you use to find work:

```text
Project → Worktree → Session
```

It is an example plugin, not a bundled BB feature. Install it from the agent-kit checkout:

```sh
bb plugin install ./bb-extensions/workspace-navigator --yes
```

Then select **Workspace Navigator** in **Settings → Appearance → Sidebar**.
Disabling or uninstalling it returns immediately to BB's built-in sidebar.

## Visual hierarchy

The sidebar is a compact directory, not an inbox:

- **Project** is the strongest row: outline folder, project name, then its
  small disclosure chevron. It has no fixed chevron rail. The entire row
  toggles, and a collapsed project alone shows one status rollup at the far
  right. Expanded projects use whitespace rather than cards or dividing rules.
- **Worktree** is indented 12 px below its project, uses an outline branch icon,
  a lower-weight branch label, then its small disclosure chevron. Its identity
  area toggles; one `⋯` action is kept at the far right. A linked, muted PR
  second line aligns with the worktree/session content.
- **Session** is indented 20 px below its worktree. Its title is primary, its
  status has a fixed left slot, and its coarse update time (`now`, `5m`, `2h`,
  `3d`, `2w`) stays at the far right. Hover or keyboard focus covers that time
  with pin, archive, and session-menu actions without changing the row layout.
- **Pinned** is a collapsible, flat section. Its header orders the label then
  chevron, followed by the muted total and, only while collapsed, one status
  glyph for the hidden pinned sessions. The collapsed choice persists in this
  browser. Expanded pinned rows stay on one line: status slot, title, and
  update time. Their native tooltip retains the full `project / worktree / session title`
  identity.
- **Usage** is the first global section, above Pinned and Projects. It starts
  collapsed and persists that choice in this browser. Its summary reports used
  capacity, not remaining capacity: each authenticated provider contributes its
  most-used window, providers sort by pressure, and the header shows at most
  two, for example `Claude 77% · Codex 15% · +1`. Under 80% is muted, 80–94%
  warns, and 95% or above is destructive.

Project and worktree rows never show session totals. Pinned's muted total and
quiet pagination labels such as **Show 5 more · 12 hidden** are the only
counts in the sidebar. Pagination follows the content indentation instead of
floating in the center. Section labels are compact and muted, with no rules or
count pills.

## Work status

There is no volatile `Now` shelf. Work status stays where the work lives:

- **Needs you**: a pending interaction, `waiting-for-input`, or `unread-error`.
- **Running**: a runtime, workflow, background agent/command, plan, goal, or
  a non-zero live activity count.

Status stays at the deepest visible level. Expanded projects and worktrees
show no rollup because their descendants are visible. A collapsed project,
worktree, or Pinned header shows one glyph for the sessions it hides, with
priority **Error → Needs input → Running → none**. There are no status counts.

A session marks only error, needs input, or running work; completed and idle
sessions have an empty status slot. Provider names, unread dots, redundant
status text, and all row-level number badges are deliberately absent.

## Directory behaviour

- Projects preserve BB's supplied order. Worktrees and sessions sort by
  `updatedAt`; there are no Active / Recent / Quiet directory shelves.
- Each project initially shows at most **5 worktrees**, and each worktree at
  most **5 sessions**. **Show 5 more · N hidden** reveals the next page at
  either level. Running, needs-input, and error worktrees/sessions always enter
  the first page rather than being hidden behind idle history.
- Projects and worktrees containing live work or the open session expand by
  default. Everything else starts compact.
- A visible worktree shows a muted, clickable second PR line, such as `PR #123
· CI running`, regardless of its CI state; hover strengthens the text. The
  plugin persists an environment-keyed cache and reuses fresh records without
  another Git-host query. It refreshes pending CI after 2 minutes, ordinary
  open PRs after 10 minutes, and merged/closed PRs after 1 hour. A refresh
  failure retains the cached result as stale.
- The host-owned search field matches session title, project name, and
  worktree name/branch. Search temporarily expands Pinned so matching bookmarks
  cannot remain hidden behind its saved collapsed state.

Every environment-backed worktree has one compact `⋯` control. Its menu is
ordered **New session**, **Rename**, then **Archive worktree**. New session
opens BB's full host-owned composer with that exact environment preselected as
`reuse`; the user can still deliberately change the selection, but an untouched
submit starts in the clicked worktree. Rename saves the trimmed custom worktree
name through BB's canonical environment update endpoint; deleting an existing
custom name restores the branch name. Managed and external worktrees can
archive after confirmation. Ordinary workspaces keep a disabled **Archive
worktree** row titled **Unavailable for regular workspace**, so the action is
discoverable without ever sending BB an invalid archive request. Archive calls
BB's canonical environment endpoint rather than archiving child sessions one at
a time; an API failure remains visible in the confirmation panel.

Usage reads Codex, Claude Code, and Cursor from BB's **primary machine** via
BB's existing SDK. The plugin never reads credentials and strips account email
before the browser RPC response. Successful data stays in server memory for 30
seconds; focus reads respect that cache, while the compact refresh button forces
a new read. There is no polling. A refresh failure retains and labels stale
cached data when available; otherwise it reports usage as unavailable without
inventing values. Expanded Usage shows every provider-reported window, compact
reset text, and Cursor spend when the provider reports a cost cap. Providers
whose CLI is not installed are hidden; sign-in, expired credentials, provider
errors, no windows, loading, and top-level machine failures each keep their
actual state visible.

Session rows retain BB's normal open, split-drag, keyboard-shortcut, pin,
archive, and delete flows. The plugin does not persist or mutate
thread/worktree metadata.

## Development

From the plugin directory:

```sh
npm install
npm run typecheck
npm test
bb plugin build .
```

---
name: cherry-pr-review
description: V's personal lightweight PR review for Cherry Studio. Understands the PR's intent from its description first and judges whether the motivation is sound; only then reviews changes bottom-up through Cherry's layers (DB schema → shared → main data → main core/services → IPC bridge → renderer data → renderer UI), checking each touched layer against its docs/references document. Presents findings to V for confirmation before posting anything to GitHub. Use when V asks to review a Cherry Studio PR by number or URL.
---

# Cherry PR Review

Docs-driven review. The repo's `docs/references/` documents ARE the checklist
— load only the ones for touched layers, never all of them. Report to V in
Chinese. **Never post anything to GitHub before V approves in Step 5.**

Arguments: PR number or URL. The deep pass (Step 3b) is decided
automatically — no flags.

## Step 1: Fetch the PR snapshot (COW clone)

Extract the PR number from `$ARGUMENTS`.

```bash
gh pr view {n} --json title,body,state,baseRefName,headRefOid,files,additions,deletions
gh pr checks {n}                                  # record CI signal; never run pnpm lint/test locally
gh api repos/{owner}/{repo}/pulls/{n}/comments    # existing review comments, for dedup
```

Abort if the PR is not OPEN. Create an isolated APFS copy-on-write clone —
never a git worktree, never review in the caller's working tree:

```bash
# Source must be a full repo (its .git is a directory, not a gitdir pointer file)
cp -cR {repo_root} ~/.agents/worktrees/cherry-studio/pr-review-{n}
cd ~/.agents/worktrees/cherry-studio/pr-review-{n}
rm -rf .git/worktrees        # forget stale worktree registrations inherited from the source
git reset --hard             # drop inherited dirty tracked state; NEVER `git clean` (keeps node_modules)
gh pr checkout {n}           # handles fork PRs; then verify HEAD == headRefOid
```

Record `REVIEW_DIR=~/.agents/worktrees/cherry-studio/pr-review-{n}`; use
`git -C` / absolute paths for all later reads. Gotchas: ignore the
`fsmonitor--daemon.ipc is a socket` cp warning; run `mise trust` in the clone
if a tool refuses to run there. Cleanup at the end is just
`rm -rf {REVIEW_DIR}` (a clone is a plain directory, nothing registered) —
skip cleanup if V may want a follow-up fix session in it.

## Step 2: Intent — is this PR worth making?

Before reading a single diff hunk:

1. Read the PR title, body, and any linked issue (`gh issue view`).
2. Read `git -C $REVIEW_DIR diff --stat <merge-base>` for the shape of the change.
3. Write a 2–3 sentence summary: what problem, what approach.
4. Judge the motivation against repo posture:
   - Is the problem real and worth solving? Is the approach proportionate,
     or does a simpler/existing mechanism already cover it?
   - Right target? v1 maintenance belongs on the `v1` branch, never `main`.
     No new Redux/Dexie/ElectronStore usage on `main`.
   - Does the diff actually do what the body claims (no undeclared scope)?

**Gate**: if the motivation is unsound or unclear, STOP here. Report the
concern and open questions to V — do not proceed to line-level review of a
change that shouldn't exist.

## Step 3: Layer review, bottom-up

Map changed files to layers, then review only the touched layers in this
order. For each: read the layer's diff, open the routed doc(s), read the
relevant sections, and check the change against them plus basic correctness.
Read surrounding code in `$REVIEW_DIR` whenever a hunk depends on context.

| # | Layer | Paths | Docs to load (only if touched) |
|---|-------|-------|-------------------------------|
| 1 | DB schema & migrations | `src/main/data/db/` | `docs/references/data/database-patterns.md`; construction/seeding/ordering/pagination guides only if those change |
| 2 | Shared contracts | `src/shared/` | `docs/references/shared-layer-architecture.md`; `docs/references/data/api-design-guidelines.md` for DataApi schemas |
| 3 | Main data (handlers, services, migration) | `src/main/data/` | `docs/references/data/README.md`, `data-api-in-main.md`; `v2-migration-guide.md` for migrators |
| 4 | Main core (lifecycle, windows, paths) | `src/main/core/` | `docs/references/lifecycle/README.md` + `lifecycle-usage.md`; `docs/references/window-manager/README.md`; `src/main/core/paths/README.md` |
| 5 | Main services & features | `src/main/services/`, `src/main/features/`, `src/main/ai/` | `docs/references/main-process-architecture.md`; `docs/references/lifecycle/lifecycle-decision-guide.md` for new services |
| 6 | IPC bridge | `src/shared/ipc/`, `src/main/ipc/`, `src/preload/`, `src/renderer/ipc/` | `docs/references/ipc/README.md`; `ipc-schema-guide.md` for contracts; `ipc-migration-guide.md` when legacy IPC is touched |
| 7 | Renderer data | `src/renderer/data/` | `docs/references/data/data-api-in-renderer.md`; cache/preference usage guides if those hooks change |
| 8 | Renderer UI | `src/renderer/`, `packages/ui/` | `docs/references/renderer-architecture.md`; `DESIGN.md` for style work |
| 9 | Docs & skills | `docs/`, `.agents/skills/` | check accuracy against the code the doc describes |

Naming applies everywhere: for added/renamed/moved files or new
classes/barrels, consult `docs/references/naming-conventions.md`.

Hard rules (always check, no doc lookup needed):

- No `console.log` — logging goes through `loggerService`.
- No hardcoded user-visible strings — i18next only.
- DataApi only for SQLite-backed business data; commands/side effects go to IpcApi.
- Handlers stay thin — business rules, validation, transactions live in services.
- Tests are `*.test.ts(x)`; changed non-trivial behavior without tests → flag it.

### Cross-layer contract pass

After the per-layer pass, walk each new/changed contract end to end —
schema → handler → preload → renderer hook/facade — and check types, error
semantics, and `null`/`undefined` handling agree at every hop. This is the
highest-value check in this repo; do not skip it.

## Step 3b: Deep pass (auto-decided)

**Decide automatically, no flag and no blocking question.** Run the deep pass
when the diff has real blast radius — it touches any of: DB schema/migrations,
IPC or DataApi contracts, lifecycle services, concurrency/async orchestration,
or the change is large (roughly >500 changed lines of non-generated code).
Otherwise skip. Either way, state the decision and the reason in one line of
the Step 5 report. V can override at any time ("跑 deep" / "跳过 deep"),
including after seeing the report — then run it late, merge the new findings,
and re-present only the additions.

The pass itself: invoke the `code-review` skill (plain, NOT `ultra`) as a
generic adversarial bug hunt over the same diff, run against `$REVIEW_DIR`
(the PR branch is checked out there; base is `{baseRefName}`). Division of
labor: Step 3 owns the Cherry-specific lens (docs compliance, boundaries,
contracts); the deep pass owns generic correctness, security, and edge cases —
do not re-run the layer checks through it.

Take only its debated, confirmed findings; drop anything duplicating a Step 3
finding or an existing PR comment; tag survivors `[deep]`. They go through the
same Step 4 consolidation and Step 5 gate — the deep pass never posts anything
itself.

## Step 4: Consolidate findings

For each candidate finding, re-read the cited code once and confirm or drop
it. Keep only findings with:

- `file:line` + short snippet from `$REVIEW_DIR`
- which doc rule or runtime behavior it violates (cite the doc)
- severity: **Blocker** (correctness/data/security/broken contract),
  **Warning** (clear boundary or maintainability issue), **Nit** (minor)
- the smallest reasonable fix, or the question to ask the author

Drop pure style preferences, speculative future-proofing, and anything an
existing PR comment already covers. Do not report analysis or ruled-out items.

## Step 5: Report to V — the gate

Present in Chinese:

1. Intent summary + motivation verdict (from Step 2)
2. CI status
3. Deep pass: ran or skipped, and why (one line)
4. Findings grouped by severity, numbered

Then ask V which findings to post (multi-select), or whether to approve.
**Nothing is posted without an explicit selection here.** If V picks nothing,
clean up and stop.

## Step 6: Post to GitHub

Requires the `gh pr-review` extension (`gh extension install EurFelux/gh-pr-review`).

```bash
gh pr-review review start --repo {owner/repo} --pr {n}          # save review-id
gh pr-review review add-comment --repo {owner/repo} --pr {n} \
  --review-id {id} --path {file} --line {line} \
  --body "**[{severity}]** {problem + suggested fix}"           # one per selected finding
gh pr-review review preview --repo {owner/repo} --pr {n} --review-id {id}
```

Show the preview to V, then submit on confirmation:

```bash
gh pr-review review submit --repo {owner/repo} --pr {n} --review-id {id} \
  --event {APPROVE|COMMENT|REQUEST_CHANGES} --body "{summary}"
```

`--line` is the absolute line in the NEW file, read from `$REVIEW_DIR`, and
must fall inside a diff hunk. Comment bodies in the PR's language (usually
English for Cherry Studio); the conversation with V stays in Chinese.

Finally: `rm -rf {REVIEW_DIR}` (ask first if the clone holds anything V might
still want).

---
name: agent-librarian
description: Delegate understanding of repositories outside the local workspace to a subagent. Use for explaining architecture or subsystem design of an external codebase, finding where a feature is implemented in a dependency, comparing patterns across repositories, reading commit history, files, or issues of a remote GitHub repo, or describing a dependency's internals even when a partial copy (vendored package, node_modules) exists locally. Not for first-party code in the current workspace — search that yourself or use agent-finder.
---

# Agent Librarian

Spawn a subagent to read and explain external repositories. Give it access hints:
`gh` CLI for issues/PRs/files, or a shallow `git clone --depth 1` into a temp dir for
whole-repo reading.

## When not to use

- Local workspace code you can fully read — use direct tools or agent-finder.
- A simple lookup answerable by fetching one URL or one `gh` command yourself.
- Code modifications — this role is read-only understanding.

## How to write the task

- Name the repository or project when you know it; include the ref/version if it
  matters (a vendored copy is not the source of truth for the layer you describe).
- Ask a specific question or describe the feature/codepath to understand, plus what
  you are trying to achieve with the answer.
- Ask for a thorough answer with file paths and evidence, suitable for reuse —
  return it in full rather than re-summarizing.

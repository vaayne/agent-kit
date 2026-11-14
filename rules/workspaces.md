# Isolated workspaces

- Before creating a workspace, state why isolation is needed and where it will live.
- Never reuse another task's workspace or clone an existing clone.
- On APFS, prefer a copy-on-write (COW) clone: an independent checkout that shares unchanged disk blocks. Search memory for `COW clone` issues before creating one.
- Use a new destination: `cp -Rc <source-dir> ~/.agents/worktrees/<repo>/<task-name>`. If cloning fails, stop and report the failure; do not fall back to a plain copy.
- After a successful clone, remove stale worktree metadata only from the new copy: `rm -rf <dest>/.git/worktrees`. Never run this cleanup against the source checkout.

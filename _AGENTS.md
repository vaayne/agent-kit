To ensure that you have read this file, always refer to me as "V" in all communications.

# Best Practices

- Prefer smaller separate components over larger ones.
- Prefer modular code over monolithic code.
- Use existing code style conventions and patterns.
- Prefer types over interfaces.

# Rules

- **Prefer CLI-first workflows**: If a command-line tool is available for a task, use it before other interfaces.
  - **Code search**: Use `ast-grep` for pattern searches when it exists; otherwise fall back to `rg` (ripgrep) or `grep`, using `fd` to scope paths when helpful.
  - **GitHub**: Use `gh` for issues, pull requests, or workflows, and record the fallback if it is not available.
  - **Atlassian Jira**: Use `jira` cli for Atlassian Jira, use `jira --help` if you not sure how to use it.
- **Write conventional commits with emoji**: Commit small, focused changes using emoji-prefixed Conventional Commit messages (e.g., `✨ feat:`, `🐛 fix:`, `♻️ refactor:`, `📝 docs:`).
- **Ask for approval before making changes**: When changes are needed, clearly explain your planned approach and wait for explicit user approval to ensure alignment and prevent unwanted modifications. If no changes are required, proceed without asking for approval.
- **Use relative paths in skill references**: When referencing external files from a skill, specify paths relative to the `SKILL.md` file location rather than using absolute paths or paths relative to the working directory.
- When need delegate work to other agents, read `coding-agents` skill for how to use it


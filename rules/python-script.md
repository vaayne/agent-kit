# Python scripts

- Use Python when shell commands cannot clearly express the automation.
- For task-specific scripts, use `~/.agents/sessions/{project}/scripts/`, where `{project}` is the repository name or current directory name. Keep repository deliverables in the repository.
- Run with `uv run --script`. If dependencies are needed, declare them with PEP 723 metadata.
- Log progress and errors for long-running or state-changing operations. Never log secrets.

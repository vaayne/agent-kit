# Model roles

The `coding` skill defines the roles, their models, their thinking levels, and
when to use each role. Load it before you delegate coding work. Handle routine
changes directly.

In Claude Code, run the Claude-model roles natively: the advisor tool, and the
`Explore` and `reviewer` subagents. Their definitions set the model and the
default effort. A Claude worker runs in ccvm by default, through the `coding`
skill; the native `worker` subagent is the host worker for tasks that need the
host. Run GPT and DeepSeek roles through the `coding` skill.

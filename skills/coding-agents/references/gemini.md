# Gemini CLI Reference

Google's Gemini CLI agent for code exploration and one-shot tasks.

> **Prefer acpx**: Most tasks can use `acpx gemini exec "..."` or `acpx gemini "..."` for unified session management. Use direct CLI below for advanced features (include-directories, Vertex AI auth).

## Installation

```bash
# Run without installing
npx @google/gemini-cli

# Global install via npm
npm install -g @google/gemini-cli

# Homebrew
brew install gemini-cli
```

After install, the command is `gemini`.

## Authentication

| Variable                    | Purpose                              |
| --------------------------- | ------------------------------------ |
| `GEMINI_API_KEY`            | Gemini API key (free tier available) |
| `GOOGLE_API_KEY`            | Google API key (Vertex AI)           |
| `GOOGLE_GENAI_USE_VERTEXAI` | Enable Vertex AI mode                |
| `GOOGLE_CLOUD_PROJECT`      | GCP project for paid tier            |

## Non-Interactive Prompt Mode

```bash
# Basic one-shot prompt
gemini -p "Explain the architecture of this project"

# With specific model
gemini -m gemini-2.5-flash -p "Summarize recent changes"

# JSON output for scripting
gemini -p "List all TODO comments" --output-format json

# Streaming JSON output
gemini -p "Analyze the codebase" --output-format stream-json

# Include additional directories in context
gemini -p "Compare API designs" --include-directories ../lib,../shared
```

## Interactive Mode

```bash
# Default interactive session
gemini

# With specific model
gemini -m gemini-2.5-flash
```

## Code Review Patterns

```bash
# Review uncommitted changes
gemini -p "Review the uncommitted changes in this repo and suggest improvements"

# Review a diff
git diff main | gemini -p "Review this diff for bugs and improvements"

# Security-focused review
gemini -p "Audit src/auth.ts for security vulnerabilities"

# Summarize recent work
gemini -p "Summarize all modifications from the last 5 commits"
```

## Useful Patterns

```bash
# Quick codebase Q&A (free tier)
gemini -p "What does the main entry point do?"

# CI/CD integration
result=$(gemini -p "Are there security issues in this diff?" --output-format json)
echo "$result" | jq '.response'

# Cross-directory analysis
gemini -p "How do these two services communicate?" --include-directories ../service-a,../service-b
```

## Key Differences from Other Agents

- **Free tier**: Gemini API has a generous free tier, making it good for high-volume one-shot queries.
- **Fast responses**: Gemini Flash models are optimized for speed.
- **No built-in sandbox**: Unlike Codex, Gemini CLI does not have built-in sandboxing for command execution.
- **No dedicated review command**: Use `-p` with review-focused prompts (no `review` subcommand like Codex).

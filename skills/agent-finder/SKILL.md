---
name: agent-finder
description: Delegate codebase search to a subagent. Use when locating code by behavior or concept rather than exact matches, when a question needs multiple chained searches, when correlating several areas of the codebase, or when filtering broad terms ("config", "logger", "cache") by context — questions like "Where do we validate JWT authentication headers?" or "Which module handles file-watcher retry logic?". Not for known file paths, exact symbols, or single-string lookups — do those yourself with rg or read.
---

# Agent Finder

Spawn a search subagent for one cohesive discovery question.

## When not to use

- You know the exact file path — read it directly.
- You want a specific symbol or exact string — a scoped `rg` is faster and cheaper.
- The answer needs one search — a subagent spawn costs more than it saves.

## How to write the task

- One call per cohesive question; batch related sub-questions into a single task
  instead of spawning per step.
- Phrase it as a precise engineering request: "Find every place we build an HTTP
  error response", not "error handling search".
- Name concrete artifacts, patterns, or APIs to narrow scope ("Express middleware",
  "fs.watch debounce"), and scope to directories when you can.
- State explicit success criteria so the subagent knows when to stop: "Return file
  paths and line numbers for all JWT verification calls".

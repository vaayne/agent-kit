// Routing data — edit this file to add models. The router's *logic* (slash means
// a full Pi id, unknown tokens get searched against `pi --list-models`) lives in
// router.ts and rarely changes; the table below is what you actually touch.

export const routes = {
  // Backend used when no --model is given (or --model claude).
  defaultBackend: "claude",

  claude: {
    // Bare aliases that Claude Code accepts as --model.
    aliases: ["opus", "sonnet", "haiku", "fable"],
    // Any token starting with one of these also routes to Claude Code.
    prefixes: ["claude-"],
  },

  pi: {
    // Friendly name -> full Pi `provider/model` id. Use this for tokens that are
    // ambiguous in a raw model search (e.g. "codex" also matches Qwen3-Coder).
    aliases: {
      codex: "openai-codex/gpt-5.5",
    } as Record<string, string>,
  },
} as const;

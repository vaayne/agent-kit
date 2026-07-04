export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type DelegateEvent =
  | { kind: "session"; id: string; ephemeral: boolean }
  | { kind: "text"; delta: string }
  | { kind: "tool_error"; name: string; detail?: string }
  | { kind: "retry"; attempt: number; max: number; message: string }
  | { kind: "cost"; usd?: number; turns?: number }
  | { kind: "done"; ok: boolean; error?: string };

// Normalized delegation request shared by all backends. The router resolves the
// user-facing model token into `model` (already backend-native) before a backend
// sees it, so backends never route — they only execute.
export type RunOptions = {
  task: string;
  cwd: string;
  model?: string;
  effort?: Effort;
  tools?: string[];
  session?: string;
  fork: boolean;
  noSession: boolean;
  system: string[];
  permissionMode: string;
  timeoutSec: number;
  maxTurns?: number;
};

// A backend streams normalized events; delegate.ts is the only I/O renderer.
export type Backend = (opts: RunOptions, signal: AbortSignal) => AsyncIterable<DelegateEvent>;

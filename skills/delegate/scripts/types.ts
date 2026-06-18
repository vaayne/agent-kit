export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

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
  // Raw args after `--`, forwarded verbatim to the backend CLI (Claude only).
  passthrough: string[];
};

// A backend turns a RunOptions into a running session and returns its exit code.
export type Backend = (opts: RunOptions) => Promise<number>;

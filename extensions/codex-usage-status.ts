import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

type UsageWindow = {
  used_percent?: number | null;
  reset_after_seconds?: number | null;
  reset_at?: number | null;
};

type RateLimitBucket = {
  allowed?: boolean;
  limit_reached?: boolean;
  primary_window?: UsageWindow | null;
  secondary_window?: UsageWindow | null;
};

type CodexUsageResponse = {
  rate_limit?: RateLimitBucket | null;
  additional_rate_limits?: Record<string, unknown> | unknown[] | null;
};

type UsageSnapshot = {
  fiveHourLeftPercent: number | null;
  sevenDayLeftPercent: number | null;
  fiveHourResetInSeconds: number | null;
  sevenDayResetInSeconds: number | null;
  isLimited: boolean;
};

type PercentDisplayMode = "left" | "used";
type ResetWindowMode = "5h" | "7d";

type ExtensionPreferences = {
  usageMode: PercentDisplayMode;
  refreshWindow: ResetWindowMode;
};

const EXTENSION_ID = "codex-usage";
const SETTINGS_KEY = "pi-codex-usage";
const DEFAULT_PERCENT_DISPLAY_MODE: PercentDisplayMode = "left";
const DEFAULT_RESET_WINDOW_MODE: ResetWindowMode = "7d";

const agentDirFromEnv = process.env.PI_CODING_AGENT_DIR?.trim();
const AGENT_DIR = agentDirFromEnv ? agentDirFromEnv : path.join(os.homedir(), ".pi", "agent");
const AUTH_FILE = path.join(AGENT_DIR, "auth.json");
const SETTINGS_FILE = path.join(AGENT_DIR, "settings.json");

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const REFRESH_INTERVAL_MS = 60_000;

const CODEX_LABEL = "Codex";
const CODEX_SPARK_LABEL = "Codex Spark";
const SPARK_MODEL_ID = "gpt-5.3-codex-spark";
const SPARK_LIMIT_NAME = "GPT-5.3-Codex-Spark";
const FIVE_HOUR_LABEL = "5h:";
const SEVEN_DAY_LABEL = "7d:";
const UNKNOWN_PERCENT = "--";

const MISSING_AUTH_ERROR_PREFIX = "Missing openai-codex OAuth access/accountId";

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function usedToLeftPercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return clampPercent(100 - value);
}

function leftToUsedPercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return clampPercent(100 - value);
}

function colorizePercent(
  theme: ExtensionContext["ui"]["theme"],
  valueLeft: number | null,
  mode: PercentDisplayMode,
): string {
  const displayValue = mode === "left" ? valueLeft : leftToUsedPercent(valueLeft);
  if (typeof displayValue !== "number" || Number.isNaN(displayValue)) {
    return theme.fg("muted", UNKNOWN_PERCENT);
  }

  const percentText = `${Math.round(clampPercent(displayValue))}%`;
  const text = mode === "left" ? `${percentText} left` : `${percentText} used`;
  if (mode === "left") {
    if (displayValue <= 10) return theme.fg("error", text);
    if (displayValue <= 25) return theme.fg("warning", text);
    return theme.fg("success", text);
  }

  if (displayValue >= 90) return theme.fg("error", text);
  if (displayValue >= 75) return theme.fg("warning", text);
  return theme.fg("success", text);
}

function formatResetCountdown(seconds: number | null): string | null {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return null;
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;

  if (days > 0) return `${days}d${hours}h`;
  if (hours > 0) return `${hours}h${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${secs}s`;
}

function isSparkModel(modelId: string | undefined): boolean {
  return modelId === SPARK_MODEL_ID;
}

function isCodexProvider(ctx: ExtensionContext): boolean {
  return ctx.model?.provider === "openai-codex";
}

function getStatusLabel(modelId: string | undefined): string {
  return isSparkModel(modelId) ? CODEX_SPARK_LABEL : CODEX_LABEL;
}

function formatStatus(
  ctx: ExtensionContext,
  usage: UsageSnapshot,
  mode: PercentDisplayMode,
  resetWindowMode: ResetWindowMode,
  modelId: string | undefined,
): string {
  const theme = ctx.ui.theme;
  const label = getStatusLabel(modelId);
  const title = usage.isLimited ? theme.fg("error", label) : theme.fg("dim", label);
  const fiveHourText = colorizePercent(theme, usage.fiveHourLeftPercent, mode);
  const sevenDayText = colorizePercent(theme, usage.sevenDayLeftPercent, mode);
  const resetSeconds = resetWindowMode === "5h" ? usage.fiveHourResetInSeconds : usage.sevenDayResetInSeconds;
  const resetText = formatResetCountdown(resetSeconds);
  const resetLabel = resetWindowMode === "5h" ? FIVE_HOUR_LABEL : SEVEN_DAY_LABEL;
  const resetStatus = resetText ? theme.fg("dim", ` (${resetLabel}↺${resetText})`) : "";

  return `${title} ${theme.fg("dim", FIVE_HOUR_LABEL)}${fiveHourText} ${
    theme.fg("dim", SEVEN_DAY_LABEL)
  }${sevenDayText}${resetStatus}`;
}

function parseModeCommandArgument(
  args: string,
  currentMode: PercentDisplayMode,
): PercentDisplayMode | null {
  const token = args.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (!token || token === "toggle") return currentMode === "left" ? "used" : "left";
  if (token === "left" || token === "used") return token;
  return null;
}

function getModeArgumentCompletions(argumentPrefix: string) {
  const prefix = argumentPrefix.trim().toLowerCase();
  const items = [
    {
      value: "left",
      label: "left",
      description: "Shows: \"Codex 5h:81% left 7d:64% left\" (Spark model: \"Codex Spark 5h:81% left 7d:64% left\")",
    },
    {
      value: "used",
      label: "used",
      description: "Shows: \"Codex 5h:19% used 7d:36% used\" (Spark model: \"Codex Spark 5h:19% used 7d:36% used\")",
    },
    {
      value: "toggle",
      label: "toggle",
      description: "Flips between \"... left\" and \"... used\"",
    },
  ];

  if (!prefix) return items;
  const filtered = items.filter((item) => item.value.startsWith(prefix));
  return filtered.length > 0 ? filtered : null;
}

function parseResetWindowCommandArgument(
  args: string,
  currentWindow: ResetWindowMode,
): ResetWindowMode | null {
  const token = args.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (!token || token === "toggle") return currentWindow === "7d" ? "5h" : "7d";
  if (token === "5h" || token === "7d") return token;
  return null;
}

function getResetWindowArgumentCompletions(argumentPrefix: string) {
  const prefix = argumentPrefix.trim().toLowerCase();
  const items = [
    {
      value: "5h",
      label: "5h",
      description: "Shows reset countdown as \"(5h:↺...)\"",
    },
    {
      value: "7d",
      label: "7d",
      description: "Shows reset countdown as \"(7d:↺...)\"",
    },
    {
      value: "toggle",
      label: "toggle",
      description: "Flips reset countdown window between \"5h\" and \"7d\"",
    },
  ];

  if (!prefix) return items;
  const filtered = items.filter((item) => item.value.startsWith(prefix));
  return filtered.length > 0 ? filtered : null;
}

async function loadAuthCredentials(): Promise<{
  accessToken: string;
  accountId: string;
}> {
  const authRaw = await fs.readFile(AUTH_FILE, "utf8");
  const auth = JSON.parse(authRaw) as Record<
    string,
    | {
      type?: string;
      access?: string | null;
      accountId?: string | null;
      account_id?: string | null;
    }
    | undefined
  >;

  const codexEntry = auth["openai-codex"];
  const authEntry = codexEntry?.type === "oauth" ? codexEntry : undefined;

  const accessToken = authEntry?.access?.trim();
  const accountId = (authEntry?.accountId ?? authEntry?.account_id)?.trim();

  if (!accessToken || !accountId) {
    throw new Error(`${MISSING_AUTH_ERROR_PREFIX} in ${AUTH_FILE}`);
  }

  return { accessToken, accountId };
}

async function requestUsageJson(): Promise<CodexUsageResponse> {
  const credentials = await loadAuthCredentials();
  const response = await fetch(USAGE_URL, {
    headers: {
      accept: "*/*",
      authorization: `Bearer ${credentials.accessToken}`,
      "chatgpt-account-id": credentials.accountId,
    },
  });

  if (!response.ok) {
    throw new Error(`Codex usage request failed (${response.status}) for ${USAGE_URL}`);
  }
  return (await response.json()) as CodexUsageResponse;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isPercentDisplayMode(value: unknown): value is PercentDisplayMode {
  return value === "left" || value === "used";
}

function isResetWindowMode(value: unknown): value is ResetWindowMode {
  return value === "5h" || value === "7d";
}

function normalizeExtensionPreferences(value: unknown): ExtensionPreferences {
  const settings = asObject(value);
  const usageModeValue = settings?.usageMode;
  const refreshWindowValue = settings?.refreshWindow;
  const usageMode = isPercentDisplayMode(usageModeValue)
    ? usageModeValue
    : DEFAULT_PERCENT_DISPLAY_MODE;
  const refreshWindow = isResetWindowMode(refreshWindowValue)
    ? refreshWindowValue
    : DEFAULT_RESET_WINDOW_MODE;
  return { usageMode, refreshWindow };
}

async function readAgentSettings(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return asObject(parsed) ?? {};
  } catch (error) {
    const errorWithCode = error as Error & { code?: string };
    if (errorWithCode.code === "ENOENT") return {};
    throw error;
  }
}

async function writeAgentSettings(settings: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

async function loadPersistedPreferences(): Promise<{
  preferences: ExtensionPreferences;
  needsWrite: boolean;
}> {
  const settings = await readAgentSettings();
  const preferences = normalizeExtensionPreferences(settings[SETTINGS_KEY]);
  const existing = asObject(settings[SETTINGS_KEY]);
  const needsWrite = !existing
    || existing.usageMode !== preferences.usageMode
    || existing.refreshWindow !== preferences.refreshWindow;
  return { preferences, needsWrite };
}

async function persistPreferences(preferences: ExtensionPreferences): Promise<void> {
  const settings = await readAgentSettings();
  settings[SETTINGS_KEY] = preferences;
  await writeAgentSettings(settings);
}

function normalizeRateLimitBucket(value: unknown): RateLimitBucket | null {
  const record = asObject(value);
  if (!record) return null;
  if (
    !(
      "primary_window" in record
      || "secondary_window" in record
      || "limit_reached" in record
      || "allowed" in record
    )
  ) {
    return null;
  }
  return record as RateLimitBucket;
}

function extractSparkRateLimitFromEntry(value: unknown): RateLimitBucket | null {
  const record = asObject(value);
  if (!record) return null;
  if (typeof record.limit_name !== "string" || record.limit_name.trim() !== SPARK_LIMIT_NAME) {
    return null;
  }
  return normalizeRateLimitBucket(record.rate_limit);
}

function findSparkRateLimitBucket(data: CodexUsageResponse): RateLimitBucket | null {
  const additional = data.additional_rate_limits;
  if (Array.isArray(additional)) {
    for (const entry of additional) {
      const bucket = extractSparkRateLimitFromEntry(entry);
      if (bucket) return bucket;
    }
  } else {
    const additionalMap = asObject(additional);
    if (additionalMap) {
      for (const value of Object.values(additionalMap)) {
        const bucket = extractSparkRateLimitFromEntry(value);
        if (bucket) return bucket;
      }
    }
  }

  return null;
}

function selectRateLimitBucket(
  data: CodexUsageResponse,
  modelId: string | undefined,
): RateLimitBucket | null {
  if (isSparkModel(modelId)) {
    return findSparkRateLimitBucket(data);
  }
  return normalizeRateLimitBucket(data.rate_limit);
}

function getResetSeconds(window: UsageWindow | null | undefined): number | null {
  const resetAfterSeconds = window?.reset_after_seconds;
  if (typeof resetAfterSeconds === "number" && !Number.isNaN(resetAfterSeconds)) {
    return resetAfterSeconds;
  }

  const resetAt = window?.reset_at;
  if (typeof resetAt !== "number" || Number.isNaN(resetAt)) return null;

  const resetAtSeconds = resetAt > 100_000_000_000 ? resetAt / 1000 : resetAt;
  return Math.max(0, resetAtSeconds - Date.now() / 1000);
}

function parseUsageSnapshot(data: CodexUsageResponse, modelId: string | undefined): UsageSnapshot {
  const selectedBucket = selectRateLimitBucket(data, modelId);
  const fiveHourWindow = selectedBucket?.primary_window;
  const fiveHourValue = fiveHourWindow?.used_percent;
  const sevenDayWindow = selectedBucket?.secondary_window;
  const sevenDayValue = sevenDayWindow?.used_percent;

  return {
    fiveHourLeftPercent: usedToLeftPercent(fiveHourValue),
    sevenDayLeftPercent: usedToLeftPercent(sevenDayValue),
    fiveHourResetInSeconds: getResetSeconds(fiveHourWindow),
    sevenDayResetInSeconds: getResetSeconds(sevenDayWindow),
    isLimited: selectedBucket?.limit_reached === true || selectedBucket?.allowed === false,
  };
}

function isMissingCodexAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes(MISSING_AUTH_ERROR_PREFIX)) return true;

  const errorWithCode = error as Error & { code?: string };
  return errorWithCode.code === "ENOENT" && error.message.includes(AUTH_FILE);
}

function createStatusRefresher() {
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let activeContext: ExtensionContext | undefined;
  let isRefreshInFlight = false;
  let queuedRefresh: {
    ctx: ExtensionContext;
    modelId: string | undefined;
  } | null = null;
  let percentDisplayMode: PercentDisplayMode = DEFAULT_PERCENT_DISPLAY_MODE;
  let resetWindowMode: ResetWindowMode = DEFAULT_RESET_WINDOW_MODE;
  let lastUsageSnapshot: UsageSnapshot | undefined;

  async function updateFooterStatus(ctx: ExtensionContext, modelId = ctx.model?.id): Promise<void> {
    if (!ctx.hasUI) return;
    if (!isCodexProvider(ctx)) {
      ctx.ui.setStatus(EXTENSION_ID, undefined);
      return;
    }
    if (isRefreshInFlight) {
      queuedRefresh = { ctx, modelId };
      return;
    }
    isRefreshInFlight = true;
    try {
      const usage = parseUsageSnapshot(await requestUsageJson(), modelId);
      lastUsageSnapshot = usage;
      ctx.ui.setStatus(
        EXTENSION_ID,
        formatStatus(ctx, usage, percentDisplayMode, resetWindowMode, modelId),
      );
    } catch (error) {
      if (isMissingCodexAuthError(error)) {
        lastUsageSnapshot = undefined;
        ctx.ui.setStatus(EXTENSION_ID, undefined);
        return;
      }

      const theme = ctx.ui.theme;
      const unavailableStatus = `${getStatusLabel(modelId)} unavailable`;
      ctx.ui.setStatus(EXTENSION_ID, theme.fg("warning", unavailableStatus));
    } finally {
      isRefreshInFlight = false;
      if (queuedRefresh) {
        const nextRefresh = queuedRefresh;
        queuedRefresh = null;
        void updateFooterStatus(nextRefresh.ctx, nextRefresh.modelId);
      }
    }
  }

  function refreshFor(ctx: ExtensionContext, modelId = ctx.model?.id): Promise<void> {
    activeContext = ctx;
    return updateFooterStatus(ctx, modelId);
  }

  function startAutoRefresh(): void {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (!activeContext) return;
      void updateFooterStatus(activeContext);
    }, REFRESH_INTERVAL_MS);
    refreshTimer.unref?.();
  }

  function stopAutoRefresh(ctx?: ExtensionContext): void {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
    ctx?.ui.setStatus(EXTENSION_ID, undefined);
  }

  async function setLoadingStatus(ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI) return;
    if (!isCodexProvider(ctx)) {
      ctx.ui.setStatus(EXTENSION_ID, undefined);
      return;
    }

    try {
      await loadAuthCredentials();
    } catch (error) {
      if (isMissingCodexAuthError(error)) {
        ctx.ui.setStatus(EXTENSION_ID, undefined);
        return;
      }
    }

    const loadingStatus = `${getStatusLabel(ctx.model?.id)} loading...`;
    ctx.ui.setStatus(EXTENSION_ID, ctx.ui.theme.fg("dim", loadingStatus));
  }

  function setPercentDisplayMode(mode: PercentDisplayMode): void {
    percentDisplayMode = mode;
  }

  function getPercentDisplayMode(): PercentDisplayMode {
    return percentDisplayMode;
  }

  function setResetWindowMode(mode: ResetWindowMode): void {
    resetWindowMode = mode;
  }

  function getResetWindowMode(): ResetWindowMode {
    return resetWindowMode;
  }

  function renderFromLastSnapshot(ctx: ExtensionContext): boolean {
    if (!ctx.hasUI || !lastUsageSnapshot) return false;
    if (!isCodexProvider(ctx)) {
      ctx.ui.setStatus(EXTENSION_ID, undefined);
      return false;
    }
    ctx.ui.setStatus(
      EXTENSION_ID,
      formatStatus(ctx, lastUsageSnapshot, percentDisplayMode, resetWindowMode, ctx.model?.id),
    );
    return true;
  }

  return {
    refreshFor,
    startAutoRefresh,
    stopAutoRefresh,
    setLoadingStatus,
    setPercentDisplayMode,
    getPercentDisplayMode,
    setResetWindowMode,
    getResetWindowMode,
    renderFromLastSnapshot,
  };
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export default function(pi: ExtensionAPI) {
  const refresher = createStatusRefresher();
  let settingsWriteQueue: Promise<void> = Promise.resolve();
  let applyingPersistedPreferences = false;
  let modeChangedDuringStartupLoad = false;
  let windowChangedDuringStartupLoad = false;

  function queuePersistCurrentPreferences(ctx: ExtensionContext): void {
    const preferences: ExtensionPreferences = {
      usageMode: refresher.getPercentDisplayMode(),
      refreshWindow: refresher.getResetWindowMode(),
    };

    settingsWriteQueue = settingsWriteQueue
      .catch(() => undefined)
      .then(() => persistPreferences(preferences));

    void settingsWriteQueue.catch((error) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify(
        `pi-codex-usage: failed to write ${SETTINGS_FILE}: ${formatErrorMessage(error)}`,
        "warning",
      );
    });
  }

  async function applyPersistedPreferences(ctx: ExtensionContext): Promise<void> {
    applyingPersistedPreferences = true;
    try {
      const { preferences, needsWrite } = await loadPersistedPreferences();
      if (!modeChangedDuringStartupLoad) {
        refresher.setPercentDisplayMode(preferences.usageMode);
      }
      if (!windowChangedDuringStartupLoad) {
        refresher.setResetWindowMode(preferences.refreshWindow);
      }
      if (needsWrite) {
        queuePersistCurrentPreferences(ctx);
      }
    } catch (error) {
      if (!modeChangedDuringStartupLoad) {
        refresher.setPercentDisplayMode(DEFAULT_PERCENT_DISPLAY_MODE);
      }
      if (!windowChangedDuringStartupLoad) {
        refresher.setResetWindowMode(DEFAULT_RESET_WINDOW_MODE);
      }
      if (!ctx.hasUI) return;

      ctx.ui.notify(
        `pi-codex-usage: failed to load ${SETTINGS_FILE}, using defaults (${DEFAULT_PERCENT_DISPLAY_MODE}, ${DEFAULT_RESET_WINDOW_MODE}): ${
          formatErrorMessage(error)
        }`,
        "warning",
      );
    } finally {
      applyingPersistedPreferences = false;
      modeChangedDuringStartupLoad = false;
      windowChangedDuringStartupLoad = false;
    }
  }

  pi.on("session_start", (_event, ctx) => {
    refresher.startAutoRefresh();
    void (async () => {
      await applyPersistedPreferences(ctx);
      await refresher.setLoadingStatus(ctx);
      await refresher.refreshFor(ctx);
    })();
  });

  pi.on("turn_end", (_event, ctx) => {
    void refresher.refreshFor(ctx);
  });

  pi.on("session_switch", (_event, ctx) => {
    void refresher.refreshFor(ctx);
  });

  pi.on("model_select", (event, ctx) => {
    void refresher.refreshFor(ctx, event.model.id);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    refresher.stopAutoRefresh(ctx);
  });

  pi.registerCommand("codex-usage-mode", {
    description: "Toggle Codex usage display mode, or set it explicitly: left | used",
    getArgumentCompletions: getModeArgumentCompletions,
    handler: async (args, ctx) => {
      const nextMode = parseModeCommandArgument(args, refresher.getPercentDisplayMode());
      if (!nextMode) return;

      if (applyingPersistedPreferences) modeChangedDuringStartupLoad = true;
      refresher.setPercentDisplayMode(nextMode);
      queuePersistCurrentPreferences(ctx);
      if (!refresher.renderFromLastSnapshot(ctx)) {
        await refresher.refreshFor(ctx);
      }
    },
  });

  pi.registerCommand("codex-usage-reset-window", {
    description: "Toggle reset countdown window, or set it explicitly: 5h | 7d",
    getArgumentCompletions: getResetWindowArgumentCompletions,
    handler: async (args, ctx) => {
      const nextWindow = parseResetWindowCommandArgument(args, refresher.getResetWindowMode());
      if (!nextWindow) return;

      if (applyingPersistedPreferences) windowChangedDuringStartupLoad = true;
      refresher.setResetWindowMode(nextWindow);
      queuePersistCurrentPreferences(ctx);
      if (!refresher.renderFromLastSnapshot(ctx)) {
        await refresher.refreshFor(ctx);
      }
    },
  });
}

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  useBbNavigate,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { Overview, taskNavigatorRpc } from "./server.js";

type Rpc = ReturnType<typeof useRpc<typeof taskNavigatorRpc>>;

interface OverviewStore {
  overview: Overview | null;
  error: string | null;
}

// One overview per browser tab, shared by the sidebar, inbox, board, and every open thread panel.
let store: OverviewStore = { overview: null, error: null };
let inflight: Promise<void> | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

function emit(next: OverviewStore): void {
  store = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function loadOverview(rpc: Rpc): Promise<void> {
  if (inflight !== null) return inflight;
  const ticket = ++sequence;
  inflight = rpc.call("overview", {})
    .then((overview) => {
      if (ticket === sequence) emit({ overview, error: null });
    })
    .catch((cause: unknown) => {
      if (ticket !== sequence) return;
      emit({ ...store, error: cause instanceof Error ? cause.message : "Could not load tasks." });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useTaskOverview(): {
  overview: Overview | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const rpc = useRpc<typeof taskNavigatorRpc>();
  const snapshot = useSyncExternalStore(subscribe, () => store);
  const reload = useCallback(() => loadOverview(rpc), [rpc]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useRealtime("overview-changed", reload);
  return {
    overview: snapshot.overview,
    error: snapshot.error,
    loading: snapshot.overview === null && snapshot.error === null,
    reload,
  };
}

/** A clock that ticks once a minute so relative ages stay honest without reloading. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function relativeAge(timestamp: number | null, now: number): string {
  if (timestamp === null) return "—";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export function projectKeyOf(taskKey: string): string {
  return taskKey.split("-", 1)[0] ?? taskKey;
}

/** The first thread a human should open for this task: the one asking, else the newest. */
export function primaryThread<T extends { status: string; updatedAt: number }>(threads: readonly T[]): T | undefined {
  return threads.find((thread) => thread.status === "pendingInteraction" || thread.status === "error")
    ?? [...threads].sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

/** Sidebar open() silently declines archived threads, so those route directly. */
export function useOpenThread(): (thread: { id: string; archived: boolean }) => void {
  const actions = useSidebarThreadActions();
  const navigate = useBbNavigate();
  return useCallback((thread) => {
    if (thread.archived) navigate.toThread(thread.id);
    else actions.open(thread.id);
  }, [actions, navigate]);
}

export function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

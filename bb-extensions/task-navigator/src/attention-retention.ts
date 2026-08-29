import { useEffect, useSyncExternalStore } from "react";
import { ATTENTION_RETENTION_MS, type AttentionRetention, type AttentionRetentionMap } from "./attention.js";

const STORAGE_KEY = "bb-plugin-task-navigator:attention-retention";
const listeners = new Set<() => void>();

function readRetention(serialized?: string | null): Map<string, AttentionRetention> {
  try {
    const raw = serialized === undefined
      ? typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY)
      : serialized;
    const parsed: unknown = JSON.parse(raw ?? "{}");
    if (typeof parsed !== "object" || parsed === null) return new Map();
    const now = Date.now();
    return new Map(
      Object.entries(parsed).flatMap(([threadId, value]) => {
        if (
          typeof value !== "object"
          || value === null
          || typeof (value as AttentionRetention).viewedAt !== "number"
          || typeof (value as AttentionRetention).attentionAt !== "number"
          || typeof (value as AttentionRetention).expiresAt !== "number"
          || (value as AttentionRetention).expiresAt <= now
        ) {
          return [];
        }
        return [[threadId, value as AttentionRetention] as const];
      }),
    );
  } catch {
    return new Map();
  }
}

function mergeRetention(
  left: AttentionRetentionMap,
  right: AttentionRetentionMap,
): Map<string, AttentionRetention> {
  const merged = new Map(left);
  for (const [threadId, candidate] of right) {
    const existing = merged.get(threadId);
    if (
      existing === undefined
      || candidate.attentionAt > existing.attentionAt
      || (candidate.attentionAt === existing.attentionAt && candidate.expiresAt > existing.expiresAt)
    ) {
      merged.set(threadId, candidate);
    }
  }
  return merged;
}

function sameRetention(left: AttentionRetentionMap, right: AttentionRetentionMap): boolean {
  return left.size === right.size && [...left].every(([threadId, value]) => {
    const candidate = right.get(threadId);
    return candidate !== undefined
      && candidate.viewedAt === value.viewedAt
      && candidate.attentionAt === value.attentionAt
      && candidate.expiresAt === value.expiresAt;
  });
}

let snapshot: ReadonlyMap<string, AttentionRetention> = readRetention();

function emit(next: ReadonlyMap<string, AttentionRetention>): void {
  if (sameRetention(snapshot, next)) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function persist(retention: AttentionRetentionMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(retention)));
  } catch {
    // Retention is a navigation convenience; storage failure must not block opening a thread.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function retainAttention(threadId: string, attentionAt: number, viewedAt = Date.now()): void {
  const retained = {
    viewedAt,
    attentionAt,
    expiresAt: viewedAt + ATTENTION_RETENTION_MS,
  } satisfies AttentionRetention;
  const next = mergeRetention(readRetention(), new Map(snapshot).set(threadId, retained));
  persist(next);
  emit(next);
}

export function reconcileAttentionRetention(
  observedAttention: ReadonlyMap<string, number | null>,
  now = Date.now(),
): void {
  const next = new Map(snapshot);
  for (const [threadId, retained] of next) {
    const observed = observedAttention.get(threadId);
    if (retained.expiresAt <= now || (observed !== undefined && observed !== null && observed > retained.attentionAt)) {
      next.delete(threadId);
    }
  }
  if (sameRetention(snapshot, next)) return;
  persist(next);
  emit(next);
}

export function useAttentionRetention(): AttentionRetentionMap {
  const retention = useSyncExternalStore(subscribe, () => snapshot);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      emit(mergeRetention(snapshot, readRetention(event.newValue)));
    };
    const timer = window.setInterval(() => reconcileAttentionRetention(new Map()), 60_000);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, []);
  return retention;
}

export const attentionRetentionTesting = { readRetention, mergeRetention, sameRetention };

import { useCallback, useEffect, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { Overview, taskNavigatorRpc } from "./server.js";

export function useTaskOverview(): {
  overview: Overview | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const rpc = useRpc<typeof taskNavigatorRpc>();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setOverview(await rpc.call("overview", {}));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load tasks.");
    }
  }, [rpc]);
  useEffect(() => {
    void load();
  }, [load]);
  useRealtime("overview-changed", load);
  return { overview, error, loading: overview === null && error === null, reload: load };
}

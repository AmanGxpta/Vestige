"use client";

import { useCallback, useState } from "react";
import type { AdapterError, Result } from "./adapter";

/** Runs one user action. `null` from the runner means the user cancelled a prompt. */
export function useAction<T>() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AdapterError | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const run = useCallback(async (fn: () => Promise<Result<T> | null>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    setCancelled(false);
    try {
      const r = await fn();
      if (r === null) {
        setCancelled(true);
        return undefined;
      }
      if (!r.ok) {
        setError(r.error);
        return undefined;
      }
      return r.value;
    } catch (e) {
      setError({ code: "NETWORK", message: e instanceof Error ? e.message : String(e) });
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  const clear = useCallback(() => {
    setError(null);
    setCancelled(false);
  }, []);
  return { run, busy, error, cancelled, clear };
}

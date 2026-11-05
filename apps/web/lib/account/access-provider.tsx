"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { apiBaseUrl } from "@/lib/api/config";
import { useSession } from "@/lib/session/hooks";
import { observeAccountAccess } from "./access-events";
import { AccountAccessStore, accessFreshnessMs } from "./access-store";

const AccessContext = createContext<AccountAccessStore | null>(null);

/** Keyed ownership discards access state even when the same account signs in again. */
export function AccountAccessProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useSession();
  const identity = user && session ? JSON.stringify([user.id, session.id]) : "signed-out";
  return <SessionAccountAccess key={identity} authenticated={Boolean(user && session)}>{children}</SessionAccountAccess>;
}

function SessionAccountAccess({ authenticated, children }: { authenticated: boolean; children: React.ReactNode }) {
  const [store] = useState(() => new AccountAccessStore((signal) => {
    if (!apiBaseUrl) return Promise.reject(new Error("API is not configured."));
    // Bootstrap handles its own errors, avoiding recursive response notifications.
    return fetch(`${apiBaseUrl}/api/v1/account/bootstrap`, { credentials: "include", cache: "no-store", signal });
  }));

  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    let timer: number;
    const schedule = () => {
      if (stopped) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(revalidate, document.visibilityState === "hidden" ? accessFreshnessMs : store.revalidationDelay());
    };
    const revalidate = () => {
      if (document.visibilityState !== "hidden") void store.load().finally(schedule);
      else schedule();
    };
    const stop = observeAccountAccess(store.receive);
    const unsubscribe = store.subscribe(schedule);
    void store.load().finally(schedule);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      stopped = true;
      stop();
      unsubscribe();
      store.dispose();
      window.clearTimeout(timer);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [authenticated, store]);

  return <AccessContext.Provider value={store}>{children}</AccessContext.Provider>;
}

export function useAccountAccess() {
  const store = useContext(AccessContext);
  if (!store) throw new Error("AccountAccessProvider is required.");
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { snapshot, retry: () => store.load(true) };
}

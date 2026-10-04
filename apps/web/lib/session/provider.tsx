"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth/client";

type Session = typeof authClient.$Infer.Session.session;
type User = typeof authClient.$Infer.Session.user;

interface SessionContextValue {
  user: User | null;
  session: Session | null;
  isPending: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  session: null,
  isPending: true,
  refresh: async () => {},
});

const subscribeToNothing = () => () => {};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending, refetch } = authClient.useSession();
  // The session lives on the API origin, so the server always renders the
  // signed-out pending state. Report pending until hydration completes so the
  // first client render matches the server HTML.
  const hydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);

  return (
    <SessionContext.Provider
      value={{
        user: hydrated ? data?.user ?? null : null,
        session: hydrated ? data?.session ?? null : null,
        isPending: !hydrated || isPending,
        refresh: refetch,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  return useContext(SessionContext);
}

"use client";

import { createContext, useContext } from "react";
import { authClient } from "@/lib/auth/client";

type Session = typeof authClient.$Infer.Session.session;
type User = typeof authClient.$Infer.Session.user;

interface SessionContextValue {
  user: User | null;
  session: Session | null;
  isPending: boolean;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  session: null,
  isPending: true,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession();

  return (
    <SessionContext.Provider
      value={{
        user: data?.user ?? null,
        session: data?.session ?? null,
        isPending,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  return useContext(SessionContext);
}

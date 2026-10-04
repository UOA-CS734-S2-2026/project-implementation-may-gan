"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session/hooks";

/** A stable QueryClient for one mounted private scope. Cleanup cancels and removes private data before a new account mounts. */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useSession();
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false }, mutations: { retry: false } } }));
  const account = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (isPending) return;
    const next = user?.id ?? "anonymous";
    if (account.current !== undefined && account.current !== next) {
      void client.cancelQueries();
      client.clear();
    }
    account.current = next;
  }, [client, isPending, user?.id]);
  useEffect(() => () => { void client.cancelQueries(); client.clear(); }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

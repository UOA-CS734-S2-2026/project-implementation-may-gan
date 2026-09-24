import { useSessionContext } from "./provider";

export function useSession() {
  return useSessionContext();
}

export function useRole() {
  const { user } = useSessionContext();

  return {
    isAdmin: user?.role === "admin",
    isUser: !!user && user.role !== "admin",
    isAuthenticated: !!user,
    role: user?.role ?? null,
  };
}

export function usePlan() {
  const { user } = useSessionContext();

  return {
    isPro: user?.tier === "pro",
    isFree: !user || user.tier === "free",
    tier: user?.tier ?? null,
  };
}

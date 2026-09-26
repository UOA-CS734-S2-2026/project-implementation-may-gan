import { useSessionContext } from "./provider";

export function useSession() {
  return useSessionContext();
}

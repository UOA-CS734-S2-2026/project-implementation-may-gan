import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/session/hooks";
import { messagingApi } from "./messaging.api";
import { messagingKeys } from "./messaging.keys";
import { unwrapMessagingResult } from "./query-result";

export function useUnreadQuery() {
  const { user } = useSession(); const userId = user?.id ?? "anonymous";
  return useQuery({ queryKey: messagingKeys.unread(userId), enabled: Boolean(user?.id), queryFn: async () => unwrapMessagingResult(await messagingApi.unread()), retry: false });
}

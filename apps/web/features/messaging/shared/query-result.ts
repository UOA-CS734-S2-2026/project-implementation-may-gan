import { type MessagingResult } from "./messaging.api";

export class MessagingApiError extends Error {
  constructor(public readonly failure: string, message: string) { super(message); this.name = "MessagingApiError"; }
}

/** Result adapter failures reject, so TanStack Query never treats a failed API result as cached data. */
export function unwrapMessagingResult<T>(result: MessagingResult<T>): T {
  if (!result.ok) throw new MessagingApiError(result.failure, result.message);
  return result.value;
}

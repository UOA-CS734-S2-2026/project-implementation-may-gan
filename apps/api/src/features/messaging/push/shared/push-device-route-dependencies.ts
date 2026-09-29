import type { ResolveSession } from "../../../../http/middleware/require-session";
import type { HasUsername } from "../../../../http/middleware/require-username";
import type { VerifiedPushSession } from "./push-device-types";

export interface PushDeviceRouteDependencies {
  resolveSession: ResolveSession;
  hasUsername?: HasUsername;
  resolvePushSession(request: Request): Promise<VerifiedPushSession | null>;
}
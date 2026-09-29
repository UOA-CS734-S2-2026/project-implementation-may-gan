import type { ResolveSession } from "../../../../http/middleware/require-session";
import type { PushPlatform, VerifiedPushSession } from "./push-device.service";

export interface PushDeviceRouteDependencies {
  resolveSession: ResolveSession;
  resolvePushSession(request: Request): Promise<VerifiedPushSession | null>;
  devices?: {
    register(
      session: VerifiedPushSession,
      device: {
        installationId: string;
        platform: PushPlatform;
        token: string;
        optedIn: boolean;
      },
    ): Promise<void>;
    unregister(session: VerifiedPushSession, installationId: string): Promise<void>;
  };
}
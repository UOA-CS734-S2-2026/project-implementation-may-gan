export type PushPlatform = "ios" | "android";

export interface VerifiedPushSession {
  userId: string;
  sessionId: string;
}

import type { AccessEvent } from "./access-events";

export interface AccountBootstrap {
  restriction: string;
  allowed: string[];
  onboarding: { legalAcceptanceRequired: boolean; usernameSetupRequired: boolean };
}
export type AccessSnapshot =
  | { state: "pending" }
  | { state: "ready"; value: AccountBootstrap }
  | { state: "unauthenticated" }
  | { state: "unavailable" };

export const accessFreshnessMs = 5 * 60 * 1000;
const pending: AccessSnapshot = { state: "pending" };

export function parseAccountBootstrap(value: unknown): AccountBootstrap {
  if (!value || typeof value !== "object") throw new Error("Invalid account bootstrap.");
  const data = value as Partial<AccountBootstrap>;
  if (typeof data.restriction !== "string" || !Array.isArray(data.allowed)
    || !data.allowed.every((item) => typeof item === "string")
    || typeof data.onboarding?.legalAcceptanceRequired !== "boolean"
    || typeof data.onboarding?.usernameSetupRequired !== "boolean") throw new Error("Invalid account bootstrap.");
  return data as AccountBootstrap;
}

/** In-memory UI snapshot only. Every API operation still enforces server policy. */
export class AccountAccessStore {
  private snapshot: AccessSnapshot = pending;
  private listeners = new Set<() => void>();
  private sequence = 0;
  private controller?: AbortController;
  private updatedAt = 0;
  private inFlight?: Promise<void>;

  constructor(private readonly read: (signal: AbortSignal) => Promise<Response>) {}

  getSnapshot = (): AccessSnapshot => this.snapshot;
  getServerSnapshot = (): AccessSnapshot => pending;
  revalidationDelay = (): number => this.snapshot.state === "ready"
    ? Math.max(1_000, accessFreshnessMs - (Date.now() - this.updatedAt))
    : accessFreshnessMs;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(snapshot: AccessSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
  private cancel(): void {
    this.sequence++;
    this.controller?.abort();
    this.inFlight = undefined;
  }
  dispose = (): void => { this.cancel(); };

  receive = (event: AccessEvent): void => {
    this.cancel();
    if (event.type === "invalidate") {
      this.updatedAt = 0;
      this.update(pending);
      void this.load(true);
    } else if (event.type === "unauthenticated") {
      this.update({ state: "unauthenticated" });
    } else {
      this.updatedAt = Date.now();
      this.update({ state: "ready", value: {
        restriction: event.restriction,
        allowed: event.allowed,
        onboarding: {
          legalAcceptanceRequired: event.restriction === "terms_blocked" || event.restriction === "age_declaration_blocked",
          usernameSetupRequired: false,
        },
      } });
      void this.load(true);
    }
  };

  load = (force = false): Promise<void> => {
    if (this.inFlight) return this.inFlight;
    if (!force && this.snapshot.state === "ready" && Date.now() - this.updatedAt < accessFreshnessMs) return Promise.resolve();
    const sequence = ++this.sequence;
    const controller = new AbortController();
    this.controller = controller;
    const task = (async () => {
      try {
        const response = await this.read(controller.signal);
        if (sequence !== this.sequence) return;
        if (response.status === 401) { this.update({ state: "unauthenticated" }); return; }
        if (!response.ok) throw new Error("Account state unavailable.");
        const value = parseAccountBootstrap(await response.json());
        if (sequence !== this.sequence) return;
        this.updatedAt = Date.now();
        this.update({ state: "ready", value });
      } catch {
        if (sequence === this.sequence) this.update({ state: "unavailable" });
      } finally {
        if (sequence === this.sequence) this.inFlight = undefined;
      }
    })();
    this.inFlight = task;
    return task;
  };
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type RateLimitBindingName = "ingress" | "read" | "write" | "message" | "media" | "realtime" | "directPush";
export type RateLimitDecision = "allowed" | "denied" | "unavailable";
export type RateLimitBindings = Partial<Record<RateLimitBindingName, RateLimitBinding>>;

export interface RateLimitProvider {
  check(binding: RateLimitBindingName, key: string): Promise<RateLimitDecision>;
  has(binding: RateLimitBindingName): boolean;
}

export interface CloudflareRateLimitProviderOptions {
  bindings?: RateLimitBindings;
  onOperationalAlert?: (message: "rate_limit_backend_unavailable") => void;
}

/**
 * Cloudflare's native limiter is an infrastructure adapter. Policy code only
 * chooses a named bucket and key. Missing bindings fail closed, while a live
 * native backend error fails open and emits an identity-free alert.
 */
export function createCloudflareRateLimitProvider(options: CloudflareRateLimitProviderOptions): RateLimitProvider {
  return {
    has(binding) {
      return Boolean(options.bindings?.[binding]);
    },
    async check(binding, key) {
      const limiter = options.bindings?.[binding];
      if (!limiter) return "unavailable";
      try {
        return (await limiter.limit({ key })).success ? "allowed" : "denied";
      } catch {
        options.onOperationalAlert?.("rate_limit_backend_unavailable");
        return "allowed";
      }
    },
  };
}

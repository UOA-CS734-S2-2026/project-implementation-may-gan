import { Configuration } from "@dayli/api-client";

const publicApiBaseUrlValue = process.env.NEXT_PUBLIC_API_BASE_URL;
const browserProxyEnabledValue = process.env.NEXT_PUBLIC_WEB_API_PROXY_ENABLED;
const webApiBaseUrlValue = process.env.NEXT_PUBLIC_WEB_API_BASE_URL;

function readExactHttpsOrigin(
  value: string | undefined,
  name: string,
  required: "never" | "development" | "always",
): string | undefined {
  value = value?.replace(/\/$/, "");
  if (!value) {
    if (required === "always" || (required === "development" && process.env.NODE_ENV === "development")) {
      throw new Error(`${name} is required in development. Run pnpm local:auth:setup or set it in apps/web/.env.local.`);
    }
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS origin without a path.`);
  }
  if (url.protocol !== "https:" || url.origin !== value || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must be an absolute HTTPS origin without a path.`);
  }
  return value;
}

function isProxyModeEnabled(value: string | undefined): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("NEXT_PUBLIC_WEB_API_PROXY_ENABLED must be true or false when set.");
}

/** Direct public API origin. Mobile and ticket WebSockets continue to use it. */
export const publicApiBaseUrl = readExactHttpsOrigin(publicApiBaseUrlValue, "NEXT_PUBLIC_API_BASE_URL", "development");

/**
 * Browser REST and Better Auth origin. It stays on the public API by default.
 * Proxy mode needs an explicit web origin so a deployed build cannot cut over
 * because a binding happened to be present.
 */
export const browserProxyEnabled = isProxyModeEnabled(browserProxyEnabledValue);
export const browserApiBaseUrl = browserProxyEnabled
  ? readExactHttpsOrigin(webApiBaseUrlValue, "NEXT_PUBLIC_WEB_API_BASE_URL", "always")
  : publicApiBaseUrl;

/** @deprecated Use browserApiBaseUrl for browser REST or publicApiBaseUrl for direct API URLs. */
export const apiBaseUrl = browserApiBaseUrl;

export function apiConfiguration(): Configuration | undefined {
  if (!browserApiBaseUrl) return undefined;
  return new Configuration({ basePath: browserApiBaseUrl, credentials: "include" });
}

import { URL } from "node:url";
import { getDomain } from "tldts";

const hostnameLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const hostedSuffixes = [".workers.dev", ".pages.dev", ".vercel.app"];

function validHostname(hostname) {
  return hostname.split(".").every((label) => hostnameLabel.test(label));
}

function rejectHostedOrLocal(hostname) {
  if (hostname === "localhost" || hostname.endsWith(".localhost")
    || hostedSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error("Staging auth origins must use the reviewed custom domain.");
  }
}

function exactHttpsOrigin(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an exact HTTPS origin.`);
  }
  if (url.protocol !== "https:" || url.origin !== value || url.pathname !== "/"
    || url.search || url.hash || !validHostname(url.hostname)) {
    throw new Error(`${name} must be an exact HTTPS origin.`);
  }
  rejectHostedOrLocal(url.hostname);
  return url;
}

export function validateStagingOrigins({ siteHost, apiOrigin, webOrigin }) {
  if (typeof siteHost !== "string" || siteHost !== siteHost.toLowerCase()
    || siteHost.split(".").length < 3 || !validHostname(siteHost)) {
    throw new Error("STAGING_AUTH_SITE_HOST must be a reviewed shared domain suffix with at least three labels.");
  }
  rejectHostedOrLocal(siteHost);
  const registeredDomain = getDomain(siteHost, { allowPrivateDomains: true });
  if (!registeredDomain) {
    throw new Error("STAGING_AUTH_SITE_HOST must include a registrable domain, not a public suffix.");
  }

  const api = exactHttpsOrigin("STAGING_AUTH_API_ORIGIN", apiOrigin);
  const web = exactHttpsOrigin("STAGING_AUTH_WEB_ORIGIN", webOrigin);
  const withinSite = (hostname) => hostname === siteHost || hostname.endsWith(`.${siteHost}`);
  if (!withinSite(api.hostname) || !withinSite(web.hostname) || api.hostname === web.hostname
    || getDomain(api.hostname, { allowPrivateDomains: true }) !== registeredDomain
    || getDomain(web.hostname, { allowPrivateDomains: true }) !== registeredDomain) {
    throw new Error("Staging API and web must have distinct same-site hosts under STAGING_AUTH_SITE_HOST.");
  }
  return { apiOrigin: api.origin, webOrigin: web.origin };
}

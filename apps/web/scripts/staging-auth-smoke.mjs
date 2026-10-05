import { fileURLToPath } from "node:url";

export const STAGING_ORIGIN = "https://staging.dayli.agroupforcoders.com";
const PROTECTED_PATH = "/settings?smoke=auth";
const STEP_TIMEOUT_MS = 15_000;
const SESSION_COOKIE = "__Secure-better-auth.session_token";
const CLOUDFLARE_ANALYTICS_HOST = "static.cloudflareinsights.com";
const CLOUDFLARE_ANALYTICS_PATH = /^\/beacon\.min\.js\/v[0-9a-f]+$/;

export class SmokeFailure extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}

function failure(category) {
  return new SmokeFailure(category);
}

function categoryFor(error, fallback) {
  return error instanceof SmokeFailure ? error.category : fallback;
}

function isTrustedUrl(value) {
  try {
    return new URL(value).origin === STAGING_ORIGIN;
  } catch {
    return false;
  }
}

// Only fixed route labels leave the browser. URL paths and queries are never reported.
export function safeDestination(value) {
  let url;
  try { url = new URL(value); }
  catch { return "unknown"; }
  if (url.origin !== STAGING_ORIGIN) return "off_origin";
  if (url.pathname === "/settings") return url.search === "?smoke=auth" ? "settings_exact" : "settings_other";
  if (url.pathname === "/sign-in") return url.searchParams.get("next") === PROTECTED_PATH ? "sign_in_expected" : "sign_in_other";
  if (url.pathname === "/auth/session-refresh") return url.searchParams.get("returnTo") === PROTECTED_PATH ? "session_refresh_expected" : "session_refresh_other";
  if (url.pathname === "/legal/acceptance") return "legal_acceptance";
  if (url.pathname === "/setup-username") return "setup_username";
  if (url.pathname === "/home") return "home";
  if (url.pathname === "/") return "landing";
  return "other_staging";
}

function isPath(page, pathname, search) {
  try {
    const url = new URL(page.url());
    return url.origin === STAGING_ORIGIN && url.pathname === pathname && (search === undefined || url.search === search);
  } catch {
    return false;
  }
}

// Cloudflare injects this versioned analytics loader into public staging pages.
// Abort it without counting it as an origin failure, so no analytics code or
// telemetry request is allowed to run. Every other off-origin request fails.
function isInjectedCloudflareAnalyticsScript(request) {
  try {
    const url = new URL(request.url());
    return (
      url.protocol === "https:"
      && url.hostname === CLOUDFLARE_ANALYTICS_HOST
      && url.port === ""
      && CLOUDFLARE_ANALYTICS_PATH.test(url.pathname)
      && url.search === ""
      && request.method() === "GET"
      && request.resourceType() === "script"
      && request.isNavigationRequest() === false
    );
  } catch {
    return false;
  }
}

/** Emit only allowlisted fields. Never pass exception text or browser values here. */
export function createSafeReporter(write = (line) => process.stdout.write(`${line}\n`)) {
  return ({ step, outcome, durationMs, category, phase, destination, progress }) => {
    const fields = [`staging_auth_smoke step=${step}`, `outcome=${outcome}`, `duration_ms=${durationMs}`];
    if (category) fields.push(`category=${category}`);
    if (step === "diagnostic" && ["login_failure", "cleanup_failure"].includes(phase)) {
      fields.push(`phase=${phase}`);
      fields.push(`destination=${[
        "unknown", "off_origin", "settings_exact", "settings_other", "sign_in_expected",
        "sign_in_other", "session_refresh_expected", "session_refresh_other", "legal_acceptance",
        "setup_username", "home", "landing", "other_staging",
      ].includes(destination) ? destination : "unknown"}`);
      if (phase === "login_failure" && progress) {
        fields.push(`submit_state=${["pending", "idle"].includes(progress.submitState) ? progress.submitState : "unknown"}`);
        for (const [field, value] of [["session_get", progress.sessionGet], ["session_refresh", progress.sessionRefresh], ["profile_get", progress.profileGet], ["settings_response", progress.settingsResponse]]) {
          fields.push(`${field}=${["no_request", "no_response", "success", "unauthorized", "rate_limited", "http_error"].includes(value) ? value : "unknown"}`);
        }
        fields.push(`settings_request=${["none", "document", "fetch", "other"].includes(progress.settingsRequest) ? progress.settingsRequest : "unknown"}`);
      }
    }
    write(fields.join(" "));
  };
}

function checkPhase(unexpectedHost, phaseBaseline) {
  if (unexpectedHost.count !== phaseBaseline) throw failure("unexpected_host");
}

async function checkTrustedPage(page, unexpectedHost, phaseBaseline) {
  checkPhase(unexpectedHost, phaseBaseline);
  if (!isTrustedUrl(page.url())) throw failure("unexpected_host");
}

async function visit(page, path, unexpectedHost, phaseBaseline) {
  await page.goto(`${STAGING_ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
  await checkTrustedPage(page, unexpectedHost, phaseBaseline);
}

async function reload(page, unexpectedHost, phaseBaseline) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
  await checkTrustedPage(page, unexpectedHost, phaseBaseline);
}

async function waitForVisible(locator, unexpectedHost, phaseBaseline) {
  await locator.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  checkPhase(unexpectedHost, phaseBaseline);
}

async function verifySettings(page, unexpectedHost, phaseBaseline) {
  await checkTrustedPage(page, unexpectedHost, phaseBaseline);
  if (!isPath(page, "/settings", "?smoke=auth")) throw failure("return_path_lost");
  await waitForVisible(page.getByRole("heading", { name: "Settings", exact: true }), unexpectedHost, phaseBaseline);
  await checkTrustedPage(page, unexpectedHost, phaseBaseline);
}

async function verifySignInDestination(page, unexpectedHost, phaseBaseline) {
  await checkTrustedPage(page, unexpectedHost, phaseBaseline);
  try {
    // The protected page can finish DOM content loading before its streamed
    // anonymous redirect updates the browser URL.
    await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/sign-in", { timeout: STEP_TIMEOUT_MS });
  } catch {
    checkPhase(unexpectedHost, phaseBaseline);
    throw failure("return_path_lost");
  }
  await checkTrustedPage(page, unexpectedHost, phaseBaseline);
  let url;
  try {
    url = new URL(page.url());
  } catch {
    throw failure("unexpected_host");
  }
  if (url.pathname !== "/sign-in" || url.searchParams.get("next") !== PROTECTED_PATH) {
    throw failure("return_path_lost");
  }
}

function isTrustedSignInRequest(request) {
  try {
    const url = new URL(request.url());
    return url.origin === STAGING_ORIGIN && url.pathname === "/api/auth/sign-in/email"
      && url.search === "" && request.method() === "POST";
  } catch { return false; }
}

function authRequestKind(request) {
  try {
    const url = new URL(request.url());
    if (url.origin !== STAGING_ORIGIN || url.search !== "") return null;
    if (url.pathname === "/api/auth/get-session") {
      if (request.method() === "GET") return "session_get";
      if (request.method() === "POST") return "session_refresh";
    }
    if (url.pathname === "/api/v1/profile/username" && request.method() === "GET") return "profile_get";
  } catch { /* Ignore URLs that cannot match the fixed origin. */ }
  return null;
}

function isSettingsRequest(request) {
  try {
    const url = new URL(request.url());
    return url.origin === STAGING_ORIGIN && url.pathname === "/settings"
      && url.searchParams.get("smoke") === "auth" && request.method() === "GET";
  } catch { return false; }
}

function settingsRequestKind(request) {
  if (request.isNavigationRequest()) return "document";
  if (request.resourceType() === "fetch") return "fetch";
  return "other";
}

function observeSignIn(page) {
  const observation = {
    requested: false,
    status: null,
    authRequests: Object.fromEntries(["session_get", "session_refresh", "profile_get"].map((kind) => [kind, { requested: false, status: null }])),
    settingsRequest: { kind: "none", requested: false, status: null },
  };
  page.on("request", (request) => {
    if (isTrustedSignInRequest(request)) observation.requested = true;
    if (isSettingsRequest(request)) {
      observation.settingsRequest.kind = settingsRequestKind(request);
      observation.settingsRequest.requested = true;
    }
    const kind = authRequestKind(request);
    if (kind) observation.authRequests[kind].requested = true;
  });
  page.on("response", (response) => {
    if (isTrustedSignInRequest(response.request())) observation.status = response.status();
    if (isSettingsRequest(response.request())) observation.settingsRequest.status = response.status();
    const kind = authRequestKind(response.request());
    if (kind) observation.authRequests[kind].status = response.status();
  });
  return observation;
}

function responseClass({ requested, status }) {
  if (!requested) return "no_request";
  if (status === null) return "no_response";
  if (status >= 200 && status < 300) return "success";
  if (status === 401) return "unauthorized";
  if (status === 429) return "rate_limited";
  return "http_error";
}

async function loginFailureCategory(context, observation) {
  if (!observation.requested) return "login_no_request";
  if (observation.status === null) return "login_no_response";
  if (observation.status === 401) return "login_http_401";
  if (observation.status === 429) return "login_http_429";
  if (observation.status < 200 || observation.status >= 300) return "login_http_error";
  const cookies = await context.cookies(STAGING_ORIGIN);
  // This category records only that the allowlisted cookie name exists. It
  // deliberately omits the cookie value and every response detail.
  return cookies.some(({ name }) => name === SESSION_COOKIE) ? "login_cookie_created_navigation_timeout" : "login_cookie_missing";
}

async function verifySessionCookie(context, unexpectedHost, phaseBaseline) {
  const cookie = (await context.cookies(STAGING_ORIGIN)).find(({ name }) => name === SESSION_COOKIE);
  checkPhase(unexpectedHost, phaseBaseline);
  if (!cookie) throw failure("session_cookie_missing");
  if (
    cookie.secure !== true
    || cookie.httpOnly !== true
    || cookie.sameSite !== "Lax"
    || cookie.domain !== new URL(STAGING_ORIGIN).hostname
    || cookie.path !== "/"
  ) {
    throw failure("session_cookie_attributes");
  }
}

async function defaultJourney({ context, page, unexpectedHost, journeyBaseline, markSessionPossible, markLoggedOut, reportDiagnostic, email, password }) {
  await visit(page, "/", unexpectedHost, journeyBaseline);
  await visit(page, PROTECTED_PATH, unexpectedHost, journeyBaseline);
  await verifySignInDestination(page, unexpectedHost, journeyBaseline);

  await page.getByLabel("Email", { exact: true }).fill(email);
  checkPhase(unexpectedHost, journeyBaseline);
  await page.getByLabel("Password", { exact: true }).fill(password);
  checkPhase(unexpectedHost, journeyBaseline);
  // The server can establish a cookie before this navigation becomes visible.
  // Cleanup must therefore assume a session exists from submission onward.
  const signIn = observeSignIn(page);
  markSessionPossible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  checkPhase(unexpectedHost, journeyBaseline);
  try {
    await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/settings" && url.search === "?smoke=auth", { timeout: STEP_TIMEOUT_MS });
    checkPhase(unexpectedHost, journeyBaseline);
  } catch {
    const submitting = await page.getByRole("button", { name: "Signing in…", exact: true }).isVisible().catch(() => false);
    reportDiagnostic("login_failure", page, {
      submitState: submitting ? "pending" : "idle",
      sessionGet: responseClass(signIn.authRequests.session_get),
      sessionRefresh: responseClass(signIn.authRequests.session_refresh),
      profileGet: responseClass(signIn.authRequests.profile_get),
      settingsRequest: signIn.settingsRequest.kind,
      settingsResponse: responseClass(signIn.settingsRequest),
    });
    if (unexpectedHost.count > journeyBaseline) throw failure("unexpected_host");
    let category;
    try { category = await loginFailureCategory(context, signIn); }
    catch { throw failure("login_observation_failed"); }
    throw failure(category);
  }
  await verifySettings(page, unexpectedHost, journeyBaseline);

  await reload(page, unexpectedHost, journeyBaseline);
  await verifySettings(page, unexpectedHost, journeyBaseline);

  const secondPage = await context.newPage();
  checkPhase(unexpectedHost, journeyBaseline);
  await visit(secondPage, PROTECTED_PATH, unexpectedHost, journeyBaseline);
  await verifySettings(secondPage, unexpectedHost, journeyBaseline);
  await verifySessionCookie(context, unexpectedHost, journeyBaseline);

  await waitForVisible(page.getByRole("button", { name: "Sign out", exact: true }), unexpectedHost, journeyBaseline);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  checkPhase(unexpectedHost, journeyBaseline);
  try {
    // SignOutButton always navigates home after its request. Home alone is not
    // logout proof, so each existing tab must subsequently lose protected access.
    await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/", { timeout: STEP_TIMEOUT_MS });
    await checkTrustedPage(page, unexpectedHost, journeyBaseline);
    await visit(page, PROTECTED_PATH, unexpectedHost, journeyBaseline);
    await verifySignInDestination(page, unexpectedHost, journeyBaseline);
    await visit(secondPage, PROTECTED_PATH, unexpectedHost, journeyBaseline);
    await verifySignInDestination(secondPage, unexpectedHost, journeyBaseline);
    checkPhase(unexpectedHost, journeyBaseline);
  } catch {
    throw failure(unexpectedHost.count > 0 ? "unexpected_host" : "logout_failed");
  }
  markLoggedOut();
}

async function confirmUnauthenticated(page, unexpectedHost, cleanupBaseline) {
  await visit(page, PROTECTED_PATH, unexpectedHost, cleanupBaseline);
  await verifySignInDestination(page, unexpectedHost, cleanupBaseline);
}

async function bestEffortLogout(page, unexpectedHost, cleanupBaseline) {
  await visit(page, PROTECTED_PATH, unexpectedHost, cleanupBaseline);
  if (isPath(page, "/sign-in")) {
    await verifySignInDestination(page, unexpectedHost, cleanupBaseline);
    return;
  }
  if (!isPath(page, "/settings", "?smoke=auth")) throw failure("cleanup_failed");

  let cleanupDestination;
  try {
    // A stale session can reach the streamed settings shell before it redirects.
    cleanupDestination = await Promise.any([
      page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/sign-in", { timeout: STEP_TIMEOUT_MS }).then(() => "sign-in"),
      page.getByRole("button", { name: "Sign out", exact: true }).waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS }).then(() => "settings"),
    ]);
  } catch {
    checkPhase(unexpectedHost, cleanupBaseline);
    throw failure("cleanup_failed");
  }
  checkPhase(unexpectedHost, cleanupBaseline);
  if (cleanupDestination === "sign-in") {
    await verifySignInDestination(page, unexpectedHost, cleanupBaseline);
    return;
  }

  await waitForVisible(page.getByRole("button", { name: "Sign out", exact: true }), unexpectedHost, cleanupBaseline);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  checkPhase(unexpectedHost, cleanupBaseline);
  await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/", { timeout: STEP_TIMEOUT_MS });
  await checkTrustedPage(page, unexpectedHost, cleanupBaseline);
  await confirmUnauthenticated(page, unexpectedHost, cleanupBaseline);
  checkPhase(unexpectedHost, cleanupBaseline);
}

function browserEnvironment(environment = process.env) {
  const allowed = ["HOME", "LANG", "LC_ALL", "PATH", "TMPDIR", "XDG_CACHE_HOME", "XDG_CONFIG_HOME"];
  return Object.fromEntries(allowed.flatMap((name) => environment[name] ? [[name, environment[name]]] : []));
}

/**
 * Runs the browser journey with a single context. The injected journey exists
 * only for local privacy tests, production always uses the default journey.
 */
export async function runSmoke({ browserType, reporter = createSafeReporter(), journey = defaultJourney, email = process.env.SMOKE_TEST_EMAIL, password = process.env.SMOKE_TEST_PASSWORD, environment = process.env }) {
  if (!email || !password) {
    reporter({ step: "configuration", outcome: "failed", durationMs: 0, category: "credentials_missing" });
    return false;
  }

  let browser;
  let context;
  let page;
  let sessionPossible = false;
  let loggedOut = false;
  let passed = false;
  const unexpectedHost = { count: 0 };
  const startedAt = Date.now();

  try {
    // Do not give the browser process credentials, GitHub tokens, or arbitrary runner environment values.
    browser = await browserType.launch({ headless: true, env: browserEnvironment(environment) });
    context = await browser.newContext();
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (isInjectedCloudflareAnalyticsScript(request)) {
        await route.abort();
        return;
      }
      if (!isTrustedUrl(request.url())) {
        unexpectedHost.count += 1;
        await route.abort();
        return;
      }
      await route.continue();
    });
    page = await context.newPage();
    const journeyBaseline = unexpectedHost.count;
    await journey({
      reportDiagnostic: (phase, currentPage, progress) => reporter({ step: "diagnostic", outcome: "observed", durationMs: Date.now() - startedAt, phase, destination: safeDestination(currentPage.url()), progress }),
      context,
      page,
      unexpectedHost,
      journeyBaseline,
      markSessionPossible: () => { sessionPossible = true; },
      markLoggedOut: () => { loggedOut = true; },
      email,
      password,
    });
    checkPhase(unexpectedHost, journeyBaseline);
    reporter({ step: "journey", outcome: "passed", durationMs: Date.now() - startedAt });
    passed = true;
  } catch (error) {
    reporter({ step: "journey", outcome: "failed", durationMs: Date.now() - startedAt, category: categoryFor(error, unexpectedHost.count > 0 ? "unexpected_host" : "browser_failure") });
  } finally {
    const cleanupStartedAt = Date.now();
    const cleanupBaseline = unexpectedHost.count;
    try {
      if (sessionPossible && !loggedOut && page) await bestEffortLogout(page, unexpectedHost, cleanupBaseline);
      checkPhase(unexpectedHost, cleanupBaseline);
      if (context) await context.close();
      checkPhase(unexpectedHost, cleanupBaseline);
      if (browser) await browser.close();
      checkPhase(unexpectedHost, cleanupBaseline);
      reporter({ step: "cleanup", outcome: "passed", durationMs: Date.now() - cleanupStartedAt });
    } catch {
      passed = false;
      if (page) reporter({ step: "diagnostic", outcome: "observed", durationMs: Date.now() - cleanupStartedAt, phase: "cleanup_failure", destination: safeDestination(page.url()) });
      reporter({ step: "cleanup", outcome: "failed", durationMs: Date.now() - cleanupStartedAt, category: "cleanup_failed" });
      try {
        if (browser) await browser.close();
      } catch {
        // Browser shutdown errors are intentionally not reported verbatim.
      }
    }
  }
  return passed;
}

async function main() {
  try {
    const { chromium } = await import("@playwright/test");
    const passed = await runSmoke({ browserType: chromium });
    if (!passed) process.exitCode = 1;
  } catch {
    createSafeReporter()({ step: "runner", outcome: "failed", durationMs: 0, category: "runner_failed" });
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

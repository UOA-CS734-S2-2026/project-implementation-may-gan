import { fileURLToPath } from "node:url";

export const STAGING_ORIGIN = "https://staging.dayli.agroupforcoders.com";
const PROTECTED_PATH = "/settings?smoke=auth";
const STEP_TIMEOUT_MS = 15_000;
const SESSION_COOKIE = /^(?:__Secure-)?better-auth\.session_token$/;

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

function isPath(page, pathname, search = "") {
  try {
    const url = new URL(page.url());
    return url.origin === STAGING_ORIGIN && url.pathname === pathname && url.search === search;
  } catch {
    return false;
  }
}

/** Emit only allowlisted fields. Never pass exception text or browser values here. */
export function createSafeReporter(write = (line) => process.stdout.write(`${line}\n`)) {
  return ({ step, outcome, durationMs, category }) => {
    const fields = [`staging_auth_smoke step=${step}`, `outcome=${outcome}`, `duration_ms=${durationMs}`];
    if (category) fields.push(`category=${category}`);
    write(fields.join(" "));
  };
}

function hasNewUnexpectedHost(unexpectedHost, checkpoint) {
  return unexpectedHost.count !== checkpoint;
}

async function checkTrustedPage(page, unexpectedHost, checkpoint = unexpectedHost.count) {
  if (hasNewUnexpectedHost(unexpectedHost, checkpoint) || !isTrustedUrl(page.url())) throw failure("unexpected_host");
}

async function visit(page, path, unexpectedHost) {
  const checkpoint = unexpectedHost.count;
  await page.goto(`${STAGING_ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
  await checkTrustedPage(page, unexpectedHost, checkpoint);
}

async function reload(page, unexpectedHost) {
  const checkpoint = unexpectedHost.count;
  await page.reload({ waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
  await checkTrustedPage(page, unexpectedHost, checkpoint);
}

async function waitForVisible(locator) {
  await locator.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
}

async function verifySettings(page, unexpectedHost) {
  await checkTrustedPage(page, unexpectedHost);
  if (!isPath(page, "/settings", "?smoke=auth")) throw failure("return_path_lost");
  await waitForVisible(page.getByRole("heading", { name: "Settings", exact: true }));
}

async function verifySignInDestination(page, unexpectedHost) {
  await checkTrustedPage(page, unexpectedHost);
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

async function verifySessionCookie(context) {
  const cookie = (await context.cookies(STAGING_ORIGIN)).find(({ name }) => SESSION_COOKIE.test(name));
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

async function defaultJourney({ context, page, unexpectedHost, markSessionPossible, markLoggedOut, email, password }) {
  await visit(page, "/", unexpectedHost);
  await visit(page, PROTECTED_PATH, unexpectedHost);
  await verifySignInDestination(page, unexpectedHost);

  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  // The server can establish a cookie before this navigation becomes visible.
  // Cleanup must therefore assume a session exists from submission onward.
  markSessionPossible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  try {
    await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/settings" && url.search === "?smoke=auth", { timeout: STEP_TIMEOUT_MS });
  } catch {
    throw failure(unexpectedHost.count > 0 ? "unexpected_host" : "login_failed");
  }
  await verifySettings(page, unexpectedHost);

  await reload(page, unexpectedHost);
  await verifySettings(page, unexpectedHost);

  const secondPage = await context.newPage();
  await visit(secondPage, PROTECTED_PATH, unexpectedHost);
  await verifySettings(secondPage, unexpectedHost);
  await verifySessionCookie(context);

  const logoutCheckpoint = unexpectedHost.count;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  try {
    // SignOutButton always navigates home after its request. Home alone is not
    // logout proof, so each existing tab must subsequently lose protected access.
    await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/", { timeout: STEP_TIMEOUT_MS });
    await checkTrustedPage(page, unexpectedHost, logoutCheckpoint);
    await visit(page, PROTECTED_PATH, unexpectedHost);
    await verifySignInDestination(page, unexpectedHost);
    await visit(secondPage, PROTECTED_PATH, unexpectedHost);
    await verifySignInDestination(secondPage, unexpectedHost);
  } catch {
    throw failure(unexpectedHost.count > 0 ? "unexpected_host" : "logout_failed");
  }
  markLoggedOut();
}

async function confirmUnauthenticated(page, unexpectedHost) {
  await visit(page, PROTECTED_PATH, unexpectedHost);
  await verifySignInDestination(page, unexpectedHost);
}

async function bestEffortLogout(page, unexpectedHost) {
  await visit(page, PROTECTED_PATH, unexpectedHost);
  if (isPath(page, "/sign-in")) {
    await verifySignInDestination(page, unexpectedHost);
    return;
  }
  if (!isPath(page, "/settings", "?smoke=auth")) throw failure("cleanup_failed");
  const logoutCheckpoint = unexpectedHost.count;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/", { timeout: STEP_TIMEOUT_MS });
  await checkTrustedPage(page, unexpectedHost, logoutCheckpoint);
  await confirmUnauthenticated(page, unexpectedHost);
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
      if (!isTrustedUrl(route.request().url())) {
        unexpectedHost.count += 1;
        await route.abort();
        return;
      }
      await route.continue();
    });
    page = await context.newPage();
    await journey({
      context,
      page,
      unexpectedHost,
      markSessionPossible: () => { sessionPossible = true; },
      markLoggedOut: () => { loggedOut = true; },
      email,
      password,
    });
    reporter({ step: "journey", outcome: "passed", durationMs: Date.now() - startedAt });
    passed = true;
  } catch (error) {
    reporter({ step: "journey", outcome: "failed", durationMs: Date.now() - startedAt, category: categoryFor(error, unexpectedHost.count > 0 ? "unexpected_host" : "browser_failure") });
  } finally {
    const cleanupStartedAt = Date.now();
    try {
      if (sessionPossible && !loggedOut && page) await bestEffortLogout(page, unexpectedHost);
      if (context) await context.close();
      if (browser) await browser.close();
      reporter({ step: "cleanup", outcome: "passed", durationMs: Date.now() - cleanupStartedAt });
    } catch {
      passed = false;
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

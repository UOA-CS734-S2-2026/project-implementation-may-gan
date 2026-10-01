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

async function checkTrustedPage(page, unexpectedHost) {
  if (unexpectedHost.value || !isTrustedUrl(page.url())) throw failure("unexpected_host");
}

async function visit(page, path, unexpectedHost) {
  await page.goto(`${STAGING_ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
  await checkTrustedPage(page, unexpectedHost);
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

async function defaultJourney({ context, page, unexpectedHost, markSignedIn, markLoggedOut, email, password }) {
  await visit(page, "/", unexpectedHost);
  await visit(page, PROTECTED_PATH, unexpectedHost);
  await verifySignInDestination(page, unexpectedHost);

  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  try {
    await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/settings" && url.search === "?smoke=auth", { timeout: STEP_TIMEOUT_MS });
  } catch {
    throw failure(unexpectedHost.value ? "unexpected_host" : "login_failed");
  }
  markSignedIn();
  await verifySettings(page, unexpectedHost);

  await page.reload({ waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
  await verifySettings(page, unexpectedHost);

  const secondPage = await context.newPage();
  await visit(secondPage, PROTECTED_PATH, unexpectedHost);
  await verifySettings(secondPage, unexpectedHost);
  await verifySessionCookie(context);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  try {
    await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/", { timeout: STEP_TIMEOUT_MS });
  } catch {
    throw failure(unexpectedHost.value ? "unexpected_host" : "logout_failed");
  }
  markLoggedOut();

  await visit(page, PROTECTED_PATH, unexpectedHost);
  await verifySignInDestination(page, unexpectedHost);
  await visit(secondPage, PROTECTED_PATH, unexpectedHost);
  await verifySignInDestination(secondPage, unexpectedHost);
}

async function bestEffortLogout(page, unexpectedHost) {
  await visit(page, PROTECTED_PATH, unexpectedHost);
  if (!isPath(page, "/settings", "?smoke=auth")) return;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/", { timeout: STEP_TIMEOUT_MS });
  await checkTrustedPage(page, unexpectedHost);
}

/**
 * Runs the browser journey with a single context. The injected journey exists
 * only for local privacy tests, production always uses the default journey.
 */
export async function runSmoke({ browserType, reporter = createSafeReporter(), journey = defaultJourney, email = process.env.SMOKE_TEST_EMAIL, password = process.env.SMOKE_TEST_PASSWORD }) {
  if (!email || !password) {
    reporter({ step: "configuration", outcome: "failed", durationMs: 0, category: "credentials_missing" });
    return false;
  }

  let browser;
  let context;
  let page;
  let signedIn = false;
  let loggedOut = false;
  let passed = false;
  const unexpectedHost = { value: false };
  const startedAt = Date.now();

  try {
    browser = await browserType.launch({ headless: true });
    context = await browser.newContext();
    await context.route("**/*", async (route) => {
      if (!isTrustedUrl(route.request().url())) {
        unexpectedHost.value = true;
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
      markSignedIn: () => { signedIn = true; },
      markLoggedOut: () => { loggedOut = true; },
      email,
      password,
    });
    reporter({ step: "journey", outcome: "passed", durationMs: Date.now() - startedAt });
    passed = true;
  } catch (error) {
    reporter({ step: "journey", outcome: "failed", durationMs: Date.now() - startedAt, category: categoryFor(error, unexpectedHost.value ? "unexpected_host" : "browser_failure") });
  } finally {
    const cleanupStartedAt = Date.now();
    try {
      if (signedIn && !loggedOut && page) await bestEffortLogout(page, unexpectedHost);
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

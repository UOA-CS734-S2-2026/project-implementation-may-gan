import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createSafeReporter, runSmoke, STAGING_ORIGIN } from "../apps/web/scripts/staging-auth-smoke.mjs";
import { readStagingReleaseAttribution } from "./validate-staging-auth-attribution.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const workflow = readFileSync(resolve(repositoryRoot, ".github", "workflows", "staging-auth-smoke.yml"), "utf8");
const protectedUrl = `${STAGING_ORIGIN}/settings?smoke=auth`;
const cloudflareAnalyticsUrl = "https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495";

function browserType(options = {}) {
  const state = {
    abortedOrigins: [],
    browserClosed: false,
    continuedOrigins: [],
    launchOptions: undefined,
    newPages: 0,
    protectedVisits: 0,
    authenticatedProtectedVisits: 0,
    session: false,
    sessionCookieName: options.sessionCookieName ?? "__Secure-better-auth.session_token",
    signInAttempts: 0,
    signOutAttempts: 0,
    streamedRedirects: 0,
    streamedRedirectWaits: 0,
  };
  let routeHandler;

  async function interceptExternal(reason, details = {}) {
    await routeHandler({
      request: () => ({
        url: () => details.url ?? "https://unexpected.example.test/resource",
        method: () => details.method ?? "GET",
        resourceType: () => details.resourceType ?? "script",
        isNavigationRequest: () => details.isNavigationRequest ?? false,
      }),
      abort: async () => { state.abortedOrigins.push(reason); },
      continue: async () => {
        state.continuedOrigins.push(reason);
        throw new Error(options.errorText);
      },
    });
  }

  async function interceptUnexpected(reason) {
    await interceptExternal(reason);
  }

  function page() {
    let currentUrl = `${STAGING_ORIGIN}/`;
    let redirectPending;
    const listeners = { request: [], response: [] };
    const signInRequest = { url: () => `${STAGING_ORIGIN}/api/auth/sign-in/email`, method: () => "POST" };

    function scheduleSignInRedirect(pathname, search) {
      const signInUrl = `${STAGING_ORIGIN}/sign-in?next=${encodeURIComponent(`${pathname}${search}`)}`;
      redirectPending = new Promise((resolve) => {
        setTimeout(() => {
          currentUrl = signInUrl;
          state.streamedRedirects += 1;
          resolve();
        }, 0);
      });
    }
    return {
      url: () => currentUrl,
      on: (event, listener) => { listeners[event].push(listener); },
      goto: async (url) => {
        if (options.unexpectedOrigin && !state.unexpectedOriginInjected) {
          state.unexpectedOriginInjected = true;
          await interceptUnexpected("startup");
        }
        if (options.cloudflareAnalytics) {
          await interceptExternal("cloudflare-analytics", {
            url: cloudflareAnalyticsUrl,
            method: "GET",
            resourceType: "script",
            isNavigationRequest: false,
          });
        }
        if (options.externalRequest && !state.externalRequestInjected) {
          state.externalRequestInjected = true;
          await interceptExternal("boundary", options.externalRequest);
        }
        const parsed = new URL(url);
        if (parsed.pathname === "/settings") {
          state.protectedVisits += 1;
          if (options.unexpectedDuringCleanup && state.protectedVisits === 3) await interceptUnexpected("cleanup");
          if (state.session) {
            state.authenticatedProtectedVisits += 1;
            if (options.unexpectedAfterLogin && state.authenticatedProtectedVisits === 1) await interceptUnexpected("after-login");
            if (options.unexpectedBetweenOperations && state.authenticatedProtectedVisits === 1) await interceptUnexpected("between-operations");
            currentUrl = `${STAGING_ORIGIN}${parsed.pathname}${parsed.search}`;
          } else if (options.delayedSignInRedirect) {
            currentUrl = `${STAGING_ORIGIN}${parsed.pathname}${parsed.search}`;
            scheduleSignInRedirect(parsed.pathname, parsed.search);
          } else {
            currentUrl = `${STAGING_ORIGIN}/sign-in?next=${encodeURIComponent(`${parsed.pathname}${parsed.search}`)}`;
          }
          return;
        }
        currentUrl = url;
      },
      waitForResponse: (predicate) => {
        if (options.signInResponseMissing || options.signInRequestMissing) return Promise.reject(new Error(options.errorText ?? "no login response"));
        return new Promise((resolve) => {
          listeners.response.push((response) => { if (predicate(response)) resolve(response); });
        });
      },
      waitForURL: async (predicate) => {
        if (!predicate(new URL(currentUrl)) && redirectPending) {
          state.streamedRedirectWaits += 1;
          await redirectPending;
          redirectPending = undefined;
        }
        if (!predicate(new URL(currentUrl))) throw new Error(options.errorText ?? "navigation failed");
      },
      getByLabel: () => ({
        fill: async () => {
          if (new URL(currentUrl).pathname !== "/sign-in") {
            throw new Error(options.errorText ?? "sign-in controls unavailable before redirect");
          }
        },
      }),
      getByRole: (_role, locator) => {
        if (locator.name === "Settings") {
          return { waitFor: async () => {
            if (options.unexpectedDuringJourneyLocator && state.session && !state.journeyLocatorExternalInjected) {
              state.journeyLocatorExternalInjected = true;
              await interceptUnexpected("journey-locator");
            }
            if (new URL(currentUrl).pathname !== "/settings") throw new Error(options.errorText ?? "settings unavailable");
          } };
        }
        if (locator.name === "Sign in") {
          return { click: async () => {
            state.signInAttempts += 1;
            if (!options.signInRequestMissing) {
              for (const listener of listeners.request) listener(signInRequest);
              if (!options.signInResponseMissing) {
                for (const listener of listeners.response) listener({ request: () => signInRequest, status: () => options.signInHttpStatus ?? 200 });
              }
            }
            state.session = !options.sessionMissingAfterFailedLogin && !options.signInRequestMissing
              && !options.signInResponseMissing && (options.signInHttpStatus ?? 200) === 200;
            if (!options.loginNavigationFails && state.session) currentUrl = protectedUrl;
          } };
        }
        if (locator.name === "Sign out") {
          return {
            waitFor: async () => {
              if (options.unexpectedDuringCleanupLocator && state.protectedVisits >= 2) await interceptUnexpected("cleanup-locator");
              if (!state.session || new URL(currentUrl).pathname !== "/settings") {
                if (redirectPending) await redirectPending;
                throw new Error(options.errorText ?? "sign-out control unavailable");
              }
            },
            click: async () => {
              state.signOutAttempts += 1;
              // The real button navigates home even when its sign-out request fails.
              currentUrl = `${STAGING_ORIGIN}/`;
              if (!options.signOutFails) state.session = false;
            },
          };
        }
        throw new Error("unexpected locator");
      },
    };
  }

  const context = {
    route: async (_pattern, handler) => { routeHandler = handler; },
    newPage: async () => {
      state.newPages += 1;
      return page();
    },
    cookies: async () => {
      if (options.cookieObservationError) throw new Error(options.errorText);
      return state.session ? [{
        name: state.sessionCookieName,
        secure: true,
        httpOnly: true,
        sameSite: options.cookieMismatch ? "Strict" : "Lax",
        domain: new URL(STAGING_ORIGIN).hostname,
        path: "/",
      }] : [];
    },
    close: async () => { if (options.closeError) throw new Error(options.errorText); },
  };
  return {
    state,
    browserType: {
      launch: async (launchOptions) => {
        state.launchOptions = launchOptions;
        return { newContext: async () => context, close: async () => { state.browserClosed = true; } };
      },
    },
  };
}

async function runDefault({ journey, ...options } = {}) {
  const fake = browserType(options);
  const lines = [];
  const email = "private-account@example.test";
  const password = "private-password";
  const cookie = "session=private-cookie";
  const passed = await runSmoke({
    browserType: fake.browserType,
    reporter: createSafeReporter((line) => lines.push(line)),
    journey,
    email,
    password,
    environment: { HOME: "/tmp/smoke", PATH: "/usr/bin", GITHUB_TOKEN: "private-token", SMOKE_TEST_PASSWORD: password },
  });
  return { fake, output: lines.join("\n"), passed, sensitive: [email, password, cookie, "private-token", options.errorText].filter(Boolean) };
}

function assertNoSensitiveOutput({ output, sensitive }) {
  for (const value of sensitive) assert.doesNotMatch(output, new RegExp(value));
}

test("the default journey completes and launches Chromium without runner secrets", async () => {
  const result = await runDefault();
  assert.equal(result.passed, true);
  assert.equal(result.fake.state.signInAttempts, 1);
  assert.equal(result.fake.state.signOutAttempts, 1);
  assert.equal(result.fake.state.newPages, 1);
  assert.equal(result.fake.state.authenticatedProtectedVisits, 1);
  assert.equal(result.fake.state.sessionCookieName, "__Secure-better-auth.session_token");
  assert.equal(result.fake.state.browserClosed, true);
  assert.deepEqual(result.fake.state.launchOptions.env, { HOME: "/tmp/smoke", PATH: "/usr/bin" });
  assertNoSensitiveOutput(result);
});

test("the verified injected Cloudflare analytics script is aborted without failing the default journey", async () => {
  const result = await runDefault({ cloudflareAnalytics: true });
  assert.equal(result.passed, true);
  assert.ok(result.fake.state.abortedOrigins.length >= 2);
  assert.ok(result.fake.state.abortedOrigins.every((reason) => reason === "cloudflare-analytics"));
  assert.deepEqual(result.fake.state.continuedOrigins, []);
  assertNoSensitiveOutput(result);
});

test("only the verified Cloudflare analytics request shape is non-fatal", async () => {
  const actualRequest = {
    url: cloudflareAnalyticsUrl,
    method: "GET",
    resourceType: "script",
    isNavigationRequest: false,
  };
  const boundaryFailures = [
    ["host", { ...actualRequest, url: "https://static.cloudflareinsights.invalid/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495" }],
    ["protocol", { ...actualRequest, url: "http://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495" }],
    ["port", { ...actualRequest, url: "https://static.cloudflareinsights.com:444/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495" }],
    ["path", { ...actualRequest, url: "https://static.cloudflareinsights.com/beacon.min.js" }],
    ["query", { ...actualRequest, url: `${cloudflareAnalyticsUrl}?unexpected=1` }],
    ["method", { ...actualRequest, method: "POST" }],
    ["resource type", { ...actualRequest, resourceType: "fetch" }],
    ["navigation", { ...actualRequest, isNavigationRequest: true }],
  ];

  for (const [boundary, externalRequest] of boundaryFailures) {
    const result = await runDefault({ externalRequest, errorText: `${boundary} private-password session=private-cookie` });
    assert.equal(result.passed, false, boundary);
    assert.deepEqual(result.fake.state.abortedOrigins, ["boundary"], boundary);
    assert.deepEqual(result.fake.state.continuedOrigins, [], boundary);
    assert.match(result.output, /step=journey outcome=failed .*category=unexpected_host/, boundary);
    assertNoSensitiveOutput(result);
  }
});

test("a streamed anonymous redirect exposes sign-in controls only after asynchronous navigation", async () => {
  const result = await runDefault({
    delayedSignInRedirect: true,
    journey: async ({ page }) => {
      await page.goto(protectedUrl);
      assert.equal(new URL(page.url()).pathname, "/settings");
      await assert.rejects(page.getByLabel("Email", { exact: true }).fill("private-account@example.test"), /sign-in controls unavailable before redirect/);
      await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/sign-in");
      await page.getByLabel("Email", { exact: true }).fill("private-account@example.test");
    },
  });
  assert.equal(result.passed, true);
  assert.equal(result.fake.state.streamedRedirects, 1);
  assert.equal(result.fake.state.streamedRedirectWaits, 1);
  assertNoSensitiveOutput(result);
});

test("a streamed anonymous redirect is awaited for the initial and post-logout checks", async () => {
  const result = await runDefault({ delayedSignInRedirect: true });
  assert.equal(result.passed, true);
  assert.ok(result.fake.state.streamedRedirects >= 2);
  assert.ok(result.fake.state.streamedRedirectWaits >= 2);
  assertNoSensitiveOutput(result);
});

test("cleanup waits for a streamed anonymous redirect when a session disappears", async () => {
  const result = await runDefault({
    delayedSignInRedirect: true,
    loginNavigationFails: true,
    sessionMissingAfterFailedLogin: true,
    errorText: "cleanup private-password session=private-cookie",
  });
  assert.equal(result.passed, false);
  assert.equal(result.fake.state.signOutAttempts, 0);
  assert.ok(result.fake.state.streamedRedirects >= 2);
  assert.ok(result.fake.state.streamedRedirectWaits >= 2);
  assert.match(result.output, /step=journey outcome=failed .*category=session_cookie_missing/);
  assert.match(result.output, /step=cleanup outcome=passed/);
  assertNoSensitiveOutput(result);
});

test("a Cloudflare analytics abort cannot hide a phase-race external request", async () => {
  const result = await runDefault({ cloudflareAnalytics: true, unexpectedDuringJourneyLocator: true, errorText: "race private-password session=private-cookie" });
  assert.equal(result.passed, false);
  assert.ok(result.fake.state.abortedOrigins.includes("cloudflare-analytics"));
  assert.ok(result.fake.state.abortedOrigins.includes("journey-locator"));
  assert.match(result.output, /step=journey outcome=failed .*category=unexpected_host/);
  assertNoSensitiveOutput(result);
});

test("client-side return navigation may stall while fresh protected access and logout succeed", async () => {
  const result = await runDefault({ loginNavigationFails: true, errorText: "login private-password session=private-cookie" });
  assert.equal(result.passed, true);
  assert.equal(result.fake.state.session, false);
  assert.equal(result.fake.state.signInAttempts, 1);
  assert.equal(result.fake.state.authenticatedProtectedVisits, 1);
  assert.equal(result.fake.state.signOutAttempts, 1);
  assert.match(result.output, /step=journey outcome=passed/);
  assert.match(result.output, /step=cleanup outcome=passed/);
  assertNoSensitiveOutput(result);
});

test("failed sign-in reports only a fixed network or cookie category", async () => {
  const cases = [
    [{ signInRequestMissing: true }, "login_no_request"],
    [{ signInResponseMissing: true }, "login_no_response"],
    [{ signInHttpStatus: 401 }, "login_http_401"],
    [{ signInHttpStatus: 429 }, "login_http_429"],
    [{ signInHttpStatus: 503 }, "login_http_error"],
    [{ sessionMissingAfterFailedLogin: true }, "session_cookie_missing"],
  ];
  for (const [options, expected] of cases) {
    const result = await runDefault({ ...options, loginNavigationFails: true,
      errorText: "failed-login private-password session=private-cookie" });
    assert.equal(result.passed, false);
    assert.match(result.output, new RegExp(`step=journey outcome=failed .*category=${expected}`));
    assert.match(result.output, /step=cleanup outcome=passed/);
    assertNoSensitiveOutput(result);
  }
});

test("cleanup accepts a queried sign-in URL when no session was created", async () => {
  const result = await runDefault({ loginNavigationFails: true, signInHttpStatus: 401,
    errorText: "failed-login private-password session=private-cookie" });
  assert.equal(result.passed, false);
  assert.equal(result.fake.state.session, false);
  assert.equal(result.fake.state.signOutAttempts, 0);
  assert.match(result.output, /category=login_http_401/);
  assert.match(result.output, /step=cleanup outcome=passed/);
  assertNoSensitiveOutput(result);
});

test("a response without a session cookie still fails protected access proof", async () => {
  const result = await runDefault({ sessionMissingAfterFailedLogin: true });
  assert.equal(result.passed, false);
  assert.equal(result.fake.state.authenticatedProtectedVisits, 0);
  assert.match(result.output, /category=session_cookie_missing/);
  assertNoSensitiveOutput(result);
});

test("an observer failure reports a fixed category without exposing the exception", async () => {
  const result = await runDefault({ loginNavigationFails: true, cookieObservationError: true,
    errorText: "observer private-password session=private-cookie" });
  assert.equal(result.passed, false);
  assert.match(result.output, /step=journey outcome=failed .*category=login_observation_failed/);
  assert.match(result.output, /step=cleanup outcome=passed/);
  assertNoSensitiveOutput(result);
});

test("an unprefixed session cookie is rejected even when its attributes match", async () => {
  const result = await runDefault({
    sessionCookieName: "better-auth.session_token",
    errorText: "cookie private-password session=private-cookie",
  });
  assert.equal(result.passed, false);
  assert.equal(result.fake.state.session, false);
  assert.equal(result.fake.state.signOutAttempts, 1);
  assert.match(result.output, /step=journey outcome=failed .*category=session_cookie_missing/);
  assert.match(result.output, /step=cleanup outcome=passed/);
  assertNoSensitiveOutput(result);
});

test("a home navigation without successful sign-out fails and cleanup confirms the failure", async () => {
  const result = await runDefault({ signOutFails: true, errorText: "logout private-password session=private-cookie" });
  assert.equal(result.passed, false);
  assert.equal(result.fake.state.session, true);
  assert.equal(result.fake.state.signOutAttempts, 2);
  assert.match(result.output, /category=logout_failed/);
  assert.match(result.output, /step=cleanup outcome=failed .*category=cleanup_failed/);
  assertNoSensitiveOutput(result);
});

test("an external request after session creation preserves the journey failure and still cleans up", async () => {
  const result = await runDefault({ unexpectedAfterLogin: true, errorText: "after-login private-password session=private-cookie" });
  assert.equal(result.passed, false);
  assert.deepEqual(result.fake.state.abortedOrigins, ["after-login"]);
  assert.equal(result.fake.state.session, false);
  assert.equal(result.fake.state.signOutAttempts, 1);
  assert.match(result.output, /step=journey outcome=failed .*category=unexpected_host/);
  assert.match(result.output, /step=cleanup outcome=passed/);
  assertNoSensitiveOutput(result);
});

test("a fresh external request during cleanup is blocked and fails safely", async () => {
  const result = await runDefault({ cookieMismatch: true, unexpectedDuringCleanupLocator: true, errorText: "cleanup-origin private-password session=private-cookie" });
  assert.equal(result.passed, false);
  assert.deepEqual(result.fake.state.abortedOrigins, ["cleanup-locator"]);
  assert.equal(result.fake.state.session, true);
  assert.equal(result.fake.state.signOutAttempts, 0);
  assert.match(result.output, /step=journey outcome=failed .*category=session_cookie_attributes/);
  assert.match(result.output, /step=cleanup outcome=failed .*category=cleanup_failed/);
  assertNoSensitiveOutput(result);
});

test("journey locator waits and inter-operation boundaries cannot absorb blocked external requests", async () => {
  for (const [option, reason] of [["unexpectedDuringJourneyLocator", "journey-locator"], ["unexpectedBetweenOperations", "between-operations"]]) {
    const result = await runDefault({ [option]: true, errorText: `${reason} private-password session=private-cookie` });
    assert.equal(result.passed, false);
    assert.deepEqual(result.fake.state.abortedOrigins, [reason]);
    assert.equal(result.fake.state.session, false);
    assert.equal(result.fake.state.signOutAttempts, 1);
    assert.match(result.output, /step=journey outcome=failed .*category=unexpected_host/);
    assert.match(result.output, /step=cleanup outcome=passed/);
    assertNoSensitiveOutput(result);
  }
});

test("unexpected-origin interception, cookie mismatches, and close failures are non-sensitive failures", async () => {
  const redirect = await runDefault({ unexpectedOrigin: true, errorText: "redirect private-password session=private-cookie" });
  assert.equal(redirect.passed, false);
  assert.deepEqual(redirect.fake.state.abortedOrigins, ["startup"]);
  assert.match(redirect.output, /category=unexpected_host/);
  assertNoSensitiveOutput(redirect);

  const cookie = await runDefault({ cookieMismatch: true, errorText: "cookie private-password session=private-cookie" });
  assert.equal(cookie.passed, false);
  assert.equal(cookie.fake.state.session, false);
  assert.match(cookie.output, /category=session_cookie_attributes/);
  assert.match(cookie.output, /step=cleanup outcome=passed/);
  assertNoSensitiveOutput(cookie);

  const cleanup = await runDefault({ closeError: true, errorText: "cleanup private-password session=private-cookie" });
  assert.equal(cleanup.passed, false);
  assert.match(cleanup.output, /step=cleanup outcome=failed .*category=cleanup_failed/);
  assertNoSensitiveOutput(cleanup);
});

test("release attribution accepts only the two captured immutable revisions", () => {
  const releaseSha = "a".repeat(40);
  const automationSha = "b".repeat(40);
  assert.deepEqual(readStagingReleaseAttribution(`release_sha=${releaseSha}\nautomation_sha=${automationSha}\n`), { releaseSha, automationSha });
  assert.throws(() => readStagingReleaseAttribution(`release_sha=${releaseSha}\nemail=private@example.test\n`));
});

test("workflow is fixed-target, trusted, serialized, and automatic runs are inactive by default", () => {
  assert.equal(STAGING_ORIGIN, "https://staging.dayli.agroupforcoders.com");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: '17 \* \* \* \*'/);
  assert.match(workflow, /workflows: \[Deploy coordinated staging release\]/);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'workflow_dispatch' \|\| github\.event\.workflow_run\.event == 'workflow_run'/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /vars\.STAGING_AUTH_SMOKE_AUTOMATION_ENABLED == 'true'/);
  assert.match(workflow, /group: staging-auth-smoke\n[ ]{2}cancel-in-progress: false/);
  assert.match(workflow, /timeout-minutes: 10/);
  assert.match(workflow, /environment: staging/);
  const chromiumInstall = "pnpm --filter @dayli/web exec playwright install --with-deps chromium";
  const credentialedSmoke = "SMOKE_TEST_EMAIL: ${{ secrets.SMOKE_TEST_EMAIL }}";
  assert.notEqual(workflow.indexOf(chromiumInstall), -1);
  assert.notEqual(workflow.indexOf(credentialedSmoke), -1);
  assert.ok(workflow.indexOf(chromiumInstall) < workflow.indexOf(credentialedSmoke), "Chromium must be installed before the credentialed smoke step");
  assert.match(workflow, /SMOKE_TEST_EMAIL: \$\{\{ secrets\.SMOKE_TEST_EMAIL \}\}/);
  assert.match(workflow, /SMOKE_TEST_PASSWORD: \$\{\{ secrets\.SMOKE_TEST_PASSWORD \}\}/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /triggering_release_revision=.*deployed_revision=unverified/);
  assert.match(workflow, /staging-release-attribution/);
  assert.doesNotMatch(workflow, /inputs:\n|pull_request|pull_request_target|\n {2}push:/);
  assert.doesNotMatch(workflow, /upload-artifact|playwright-report|trace:|video:|screenshot:|har:/i);
});

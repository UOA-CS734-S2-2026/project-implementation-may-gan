import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createSafeReporter, runSmoke, STAGING_ORIGIN } from "../apps/web/scripts/staging-auth-smoke.mjs";
import { readStagingReleaseAttribution } from "./validate-staging-auth-attribution.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const workflow = readFileSync(resolve(repositoryRoot, ".github", "workflows", "staging-auth-smoke.yml"), "utf8");
const protectedUrl = `${STAGING_ORIGIN}/settings?smoke=auth`;

function browserType(options = {}) {
  const state = { abortedOrigins: [], browserClosed: false, launchOptions: undefined, protectedVisits: 0, session: false, signInAttempts: 0, signOutAttempts: 0 };
  let routeHandler;

  async function interceptUnexpected(reason) {
    await routeHandler({
      request: () => ({ url: () => "https://unexpected.example.test/resource" }),
      abort: async () => { state.abortedOrigins.push(reason); },
      continue: async () => { throw new Error(options.errorText); },
    });
  }

  function page() {
    let currentUrl = `${STAGING_ORIGIN}/`;
    return {
      url: () => currentUrl,
      goto: async (url) => {
        if (options.unexpectedOrigin && state.abortedOrigins.length === 0) await interceptUnexpected("startup");
        const parsed = new URL(url);
        if (parsed.pathname === "/settings") {
          state.protectedVisits += 1;
          if (options.unexpectedDuringCleanup && state.protectedVisits === 3) await interceptUnexpected("cleanup");
          currentUrl = state.session
            ? `${STAGING_ORIGIN}${parsed.pathname}${parsed.search}`
            : `${STAGING_ORIGIN}/sign-in?next=${encodeURIComponent(`${parsed.pathname}${parsed.search}`)}`;
          return;
        }
        currentUrl = url;
      },
      reload: async () => { if (options.unexpectedAfterLogin) await interceptUnexpected("after-login"); },
      waitForURL: async (predicate) => {
        if (!predicate(new URL(currentUrl))) throw new Error(options.errorText ?? "navigation failed");
      },
      getByLabel: () => ({ fill: async () => {} }),
      getByRole: (_role, locator) => {
        if (locator.name === "Settings") {
          return { waitFor: async () => {
            if (new URL(currentUrl).pathname !== "/settings") throw new Error(options.errorText ?? "settings unavailable");
          } };
        }
        if (locator.name === "Sign in") {
          return { click: async () => {
            state.signInAttempts += 1;
            state.session = true;
            if (!options.loginNavigationFails) currentUrl = protectedUrl;
          } };
        }
        if (locator.name === "Sign out") {
          return { click: async () => {
            state.signOutAttempts += 1;
            // The real button navigates home even when its sign-out request fails.
            currentUrl = `${STAGING_ORIGIN}/`;
            if (!options.signOutFails) state.session = false;
          } };
        }
        throw new Error("unexpected locator");
      },
    };
  }

  const context = {
    route: async (_pattern, handler) => { routeHandler = handler; },
    newPage: async () => page(),
    cookies: async () => [{
      name: "__Secure-better-auth.session_token",
      secure: true,
      httpOnly: true,
      sameSite: options.cookieMismatch ? "Strict" : "Lax",
      domain: new URL(STAGING_ORIGIN).hostname,
      path: "/",
    }],
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

async function runDefault(options = {}) {
  const fake = browserType(options);
  const lines = [];
  const email = "private-account@example.test";
  const password = "private-password";
  const cookie = "session=private-cookie";
  const passed = await runSmoke({
    browserType: fake.browserType,
    reporter: createSafeReporter((line) => lines.push(line)),
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
  assert.equal(result.fake.state.browserClosed, true);
  assert.deepEqual(result.fake.state.launchOptions.env, { HOME: "/tmp/smoke", PATH: "/usr/bin" });
  assertNoSensitiveOutput(result);
});

test("a session created before failed sign-in navigation is cleaned up once", async () => {
  const result = await runDefault({ loginNavigationFails: true, errorText: "login private-password session=private-cookie" });
  assert.equal(result.passed, false);
  assert.equal(result.fake.state.session, false);
  assert.equal(result.fake.state.signInAttempts, 1);
  assert.equal(result.fake.state.signOutAttempts, 1);
  assert.match(result.output, /category=login_failed/);
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
  const result = await runDefault({ cookieMismatch: true, unexpectedDuringCleanup: true, errorText: "cleanup-origin private-password session=private-cookie" });
  assert.equal(result.passed, false);
  assert.deepEqual(result.fake.state.abortedOrigins, ["cleanup"]);
  assert.equal(result.fake.state.session, true);
  assert.equal(result.fake.state.signOutAttempts, 0);
  assert.match(result.output, /step=journey outcome=failed .*category=session_cookie_attributes/);
  assert.match(result.output, /step=cleanup outcome=failed .*category=cleanup_failed/);
  assertNoSensitiveOutput(result);
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
  assert.match(workflow, /SMOKE_TEST_EMAIL: \$\{\{ secrets\.SMOKE_TEST_EMAIL \}\}/);
  assert.match(workflow, /SMOKE_TEST_PASSWORD: \$\{\{ secrets\.SMOKE_TEST_PASSWORD \}\}/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /triggering_release_revision=.*deployed_revision=unverified/);
  assert.match(workflow, /staging-release-attribution/);
  assert.doesNotMatch(workflow, /inputs:\n|pull_request|pull_request_target|\n {2}push:/);
  assert.doesNotMatch(workflow, /upload-artifact|playwright-report|trace:|video:|screenshot:|har:/i);
});

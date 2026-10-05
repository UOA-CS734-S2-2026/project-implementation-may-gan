import { expect, type Page } from "@playwright/test";

type AccountDetails = {
  username: string;
  publicName: string;
  email: string;
  password: string;
};

const consentText = "I agree to the Terms of Service, acknowledge the Privacy Policy, and confirm I am 16 or older.";

async function expectLegalLinks(page: Page) {
  await expect(page.getByRole("link", { name: "Terms of Service", exact: true }).last()).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "Privacy Policy", exact: true }).last()).toHaveAttribute("href", "/privacy");
}

/** Completes the real sign-up form without inferring consent from submission. */
export async function signUpWithExplicitConsent(page: Page, account: AccountDetails) {
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Public name (optional)").fill(account.publicName);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await expectLegalLinks(page);

  const consent = page.getByLabel(consentText, { exact: true });
  await expect(consent).toBeVisible();
  await expect(consent).not.toBeChecked();

  // Sign-up currently explains the required action instead of disabling submit.
  await page.getByRole("button", { name: "Let's go" }).click();
  await expect(page.getByText("Confirm the Terms and that you are 16 or older.")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-up(?:\?|$)/);

  await consent.check();
  await expect(consent).toBeChecked();
  await page.getByRole("button", { name: "Let's go" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

/** Accepts the current policy through the blocked-account UI and proves readiness. */
export async function acceptRequiredLegalConsent(page: Page) {
  await expect(page).toHaveURL(/\/legal\/acceptance(?:\?|$)/);
  await expectLegalLinks(page);
  await expect(page.getByText(consentText, { exact: true })).toBeVisible();

  const consent = page.locator("#legal-acceptance-action");
  const submit = page.getByRole("button", { name: "Accept and continue" });
  await expect(consent).not.toBeChecked();
  await expect(submit).toBeDisabled();
  await consent.check();
  await expect(consent).toBeChecked();

  const acceptance = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/legal/acceptance") && response.request().method() === "POST",
  );
  await submit.click();
  expect((await acceptance).status()).toBe(200);
  await expect(page).toHaveURL(/\/home$/);

  await expect.poll(async () => {
    const [sessionResponse, policyResponse] = await Promise.all([
      page.request.get(`${process.env.E2E_API_ORIGIN}/api/auth/get-session`),
      page.request.get(`${process.env.E2E_API_ORIGIN}/api/v1/account/status`),
    ]);
    const session = sessionResponse.ok() ? await sessionResponse.json() as { user?: { id?: string } } : {};
    const policy = policyResponse.ok() ? await policyResponse.json() as { restriction?: string } : {};
    return { sessionReady: typeof session.user?.id === "string", restriction: policy.restriction };
  }).toEqual({ sessionReady: true, restriction: "active" });
}

/** Creates an accepted API fixture using the same explicit registration intent as clients. */
export async function signUpAcceptedApiFixture(page: Page, account: AccountDetails) {
  const apiOrigin = process.env.E2E_API_ORIGIN!;
  const currentResponse = await page.request.get(`${apiOrigin}/api/v1/legal/current`);
  expect(currentResponse.status()).toBe(200);
  const current = await currentResponse.json() as {
    status?: string;
    termsVersionId?: string;
    termsContentDigest?: string;
  };
  expect(current.status).toBe("effective");
  expect(current.termsVersionId).toEqual(expect.any(String));
  expect(current.termsContentDigest).toMatch(/^[0-9a-f]{64}$/);

  const intentResponse = await page.request.post(`${apiOrigin}/api/v1/legal/registration-intent`, {
    data: {
      flow: "email",
      termsVersionId: current.termsVersionId,
      termsContentDigest: current.termsContentDigest,
      acceptedTermsAndDeclaredAge16: true,
    },
  });
  expect(intentResponse.status()).toBe(200);
  const intent = await intentResponse.json() as { token?: string; binding?: string };
  expect(intent.token).toMatch(/^[0-9a-f]{64}$/);
  expect(intent.binding).toMatch(/^[0-9a-f]{64}$/);

  const fixtureOctet = 20 + [...account.username].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 200;
  const response = await page.request.post(`${apiOrigin}/api/auth/sign-up/email`, {
    headers: {
      "cf-connecting-ip": `198.51.100.${fixtureOctet}`,
      "x-dayli-registration-intent": intent.token!,
      "x-dayli-registration-binding": intent.binding!,
    },
    data: {
      name: account.publicName,
      username: account.username,
      displayUsername: account.publicName,
      email: account.email,
      password: account.password,
    },
  });
  expect(response.status()).toBe(200);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/home$/);
}

import { describe, expect, it, vi } from "vitest";
import {
  AuthEmailDeliveryError,
  passwordResetEmail,
  sendResendAuthEmail,
  verificationEmail,
} from "./resend";

const configuration = { apiKey: "test-resend-key", from: "Dayli <auth@example.test>" };

describe("Resend authentication delivery", () => {
  it("posts a verification email over HTTPS without exposing data in errors", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe("https://api.resend.com/emails");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ authorization: "Bearer test-resend-key" });
      expect(init?.body).toContain("Verify your Dayli email");
      return new Response("{}", { status: 200 });
    });

    await expect(sendResendAuthEmail(
      configuration,
      verificationEmail("user@example.test", "https://api.example.test/api/auth/verify-email?token=short-lived-token"),
      fetchFn,
    )).resolves.toBeUndefined();
  });

  it.each([
    [verificationEmail, "Verify email", "Verify your email address to continue."],
    [passwordResetEmail, "Reset password", "Reset your password using this link."],
  ])("renders a branded, escaped email with a plain-text fallback", (createEmail, action, intro) => {
    const url = 'https://example.test/auth?token=a&next="<unsafe>"';
    const email = createEmail("user@example.test", url);

    expect(email.text).toContain(`${intro}\n\n${url}`);
    expect(email.text).toContain("If you did not request this");
    expect(email.html).toContain("#FBFAF9");
    expect(email.html).toContain("#A684FF");
    expect(email.html).toContain("one post, every day.");
    expect(email.html).toContain(`${action} &rarr;`);
    expect(email.html).toContain('href="https://example.test/auth?token=a&amp;next=&quot;&lt;unsafe&gt;&quot;"');
    expect(email.html).not.toContain(url);
  });

  it("does not leak provider response data when delivery fails", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("provider details", { status: 500 }));

    await expect(sendResendAuthEmail(
      configuration,
      passwordResetEmail("user@example.test", "https://api.example.test/reset-password/short-lived-token"),
      fetchFn,
    )).rejects.toEqual(new AuthEmailDeliveryError());
  });
});

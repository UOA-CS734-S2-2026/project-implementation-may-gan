import { describe, expect, it, vi } from "vitest";
import {
  AuthEmailDeliveryError,
  passwordResetEmail,
  sendResendAuthEmail,
  verificationEmail,
} from "../resend";

const configuration = { apiKey: "test-resend-key", from: "Dayli <auth@example.test>" };

describe("Resend authentication delivery", () => {
  it("posts a verification email over HTTPS without exposing data in errors", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe("https://api.resend.com/emails");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ authorization: "Bearer test-resend-key" });
      expect(init?.body).toContain("Verify your Dayli email");
      const body = JSON.parse(String(init?.body));
      expect(body.attachments).toEqual([{
        filename: "dayli-logo.png",
        content: expect.any(String),
        content_id: "dayli-logo",
      }]);
      expect(body.attachments[0].content.length).toBeGreaterThan(1000);
      expect(body.html).toContain('src="cid:dayli-logo"');
      return new Response("{}", { status: 200 });
    });

    await expect(sendResendAuthEmail(
      configuration,
      verificationEmail("user@example.test", "https://api.example.test/api/auth/verify-email?token=short-lived-token"),
      fetchFn,
    )).resolves.toBeUndefined();
  });

  it.each([
    [verificationEmail, "Verify email", "Verify your email", "Verify your email address to continue."],
    [passwordResetEmail, "Reset password", "Reset your password", "Reset your password using this link."],
  ])("renders a branded, escaped email with a plain-text fallback", (createEmail, action, heading, intro) => {
    const url = 'https://example.test/auth?token=a&next="<unsafe>"';
    const email = createEmail("user@example.test", url);

    expect(email.text).toContain(`${intro}\n\n${url}`);
    expect(email.text).toContain("If you did not request this");
    expect(email.html).toContain("#FBFAF9");
    expect(email.html).toContain("#F3E8FF");
    expect(email.html).toMatch(new RegExp(`<h1[^>]*>${heading}</h1>`));
    expect(email.html).not.toContain("One more step.");
    expect(email.html).not.toContain("A fresh start.");
    expect(email.html).not.toContain("one post, every day.");
    expect(email.html).toContain("font-family:Spectral,Georgia,serif");
    expect(email.html).toContain('src="cid:dayli-logo"');
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

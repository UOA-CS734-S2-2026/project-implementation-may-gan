import { dayliLogoPngBase64 } from "./dayli-logo";

export interface ResendAuthEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; content: string; content_id: string }[];
}

export interface ResendConfiguration {
  apiKey: string;
  from: string;
}

export class AuthEmailDeliveryError extends Error {
  constructor() {
    super("Authentication email delivery failed.");
  }
}

/**
 * Sends one transactional authentication message. The caller must not log the
 * message because it can contain a short-lived authentication link.
 */
export async function sendResendAuthEmail(
  configuration: ResendConfiguration,
  email: ResendAuthEmail,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${configuration.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: configuration.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: email.attachments,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new AuthEmailDeliveryError();
  } catch {
    throw new AuthEmailDeliveryError();
  } finally {
    clearTimeout(timeout);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

function authenticationEmail(
  to: string,
  subject: string,
  heading: string,
  intro: string,
  action: string,
  url: string,
): ResendAuthEmail {
  const safeUrl = escapeHtml(url);
  const safeHeading = escapeHtml(heading);
  const safeIntro = escapeHtml(intro);
  const safeAction = escapeHtml(action);
  const note = "If you did not request this, you can ignore this email.";

  return {
    to,
    subject,
    text: `${intro}\n\n${url}\n\n${note}`,
    attachments: [{ filename: "dayli-logo.png", content: dayliLogoPngBase64, content_id: "dayli-logo" }],
    html: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FBFAF9;color:#2B2422;font-family:Epilogue,Arial,Helvetica,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;color:#FBFAF9;max-height:0;max-width:0;opacity:0;overflow:hidden;">${safeIntro}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FBFAF9;">
    <tr><td align="center" style="padding:56px 20px 64px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:358px;">
        <tr><td align="center" style="padding:0 0 32px;">
          <img src="cid:dayli-logo" alt="Dayli" width="200" height="102" style="display:block;width:200px;height:auto;border:0;color:#6E11B0;font-family:Spectral,Georgia,serif;font-size:28px;" />
        </td></tr>
        <tr><td style="background-color:#FFFFFF;border-radius:8px;padding:28px;box-shadow:2px 2px 8px rgba(0,0,0,0.01),8px 8px 16px rgba(0,0,0,0.02),16px 16px 32px rgba(0,0,0,0.03);">
          <h1 style="margin:0 0 24px;color:#2B2422;font-family:Spectral,Georgia,serif;font-size:24px;font-weight:600;letter-spacing:-0.6px;line-height:1.3;">${safeHeading}</h1>
          <p style="margin:0 0 24px;color:#2B2422;font-size:14px;line-height:1.6;">${safeIntro}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#F3E8FF;border-radius:12px;">
            <a href="${safeUrl}" style="display:inline-block;padding:8px 16px;color:#6E11B0;font-family:Spectral,Georgia,serif;font-size:16px;font-weight:600;line-height:1.4;text-decoration:none;">${safeAction} &rarr;</a>
          </td></tr></table>
          <p style="margin:32px 0 8px;color:#525252;font-size:12px;line-height:1.6;">Button not working? Copy this link into your browser:</p>
          <p style="margin:0;overflow-wrap:anywhere;word-break:break-all;font-size:12px;line-height:1.6;"><a href="${safeUrl}" style="color:#6E11B0;text-decoration:underline;">${safeUrl}</a></p>
        </td></tr>
        <tr><td align="center" style="padding:24px 8px 0;color:#525252;font-size:12px;line-height:1.6;">${note}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function verificationEmail(to: string, url: string): ResendAuthEmail {
  return authenticationEmail(to, "Verify your Dayli email", "Verify your email", "Verify your email address to continue.", "Verify email", url);
}

export function passwordResetEmail(to: string, url: string): ResendAuthEmail {
  return authenticationEmail(to, "Reset your Dayli password", "Reset your password", "Reset your password using this link.", "Reset password", url);
}

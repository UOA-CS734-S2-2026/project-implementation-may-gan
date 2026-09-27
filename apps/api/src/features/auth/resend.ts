export interface ResendAuthEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
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
    html: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FBFAF9;color:#2B2422;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;color:#FBFAF9;max-height:0;max-width:0;opacity:0;overflow:hidden;">${safeIntro}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FBFAF9;">
    <tr><td align="center" style="padding:48px 20px 56px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
        <tr><td style="padding:0 0 28px;">
          <span style="font-family:Georgia,Times New Roman,serif;font-size:38px;font-style:italic;font-weight:bold;letter-spacing:-3px;color:#A684FF;">dayli.</span>
        </td></tr>
        <tr><td style="background-color:#FFFFFF;border:1px solid #E8E4E3;border-radius:16px;padding:40px 36px 36px;">
          <p style="margin:0 0 20px;color:#6E11B0;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">YOUR DAYLI ACCOUNT</p>
          <h1 style="margin:0 0 18px;color:#2B2422;font-family:Georgia,Times New Roman,serif;font-size:32px;font-weight:normal;line-height:1.2;">${safeHeading}</h1>
          <p style="margin:0 0 30px;color:#525252;font-size:16px;line-height:1.6;">${safeIntro}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#6E11B0;border-radius:8px;">
            <a href="${safeUrl}" style="display:inline-block;padding:14px 24px;color:#FFFFFF;font-size:15px;font-weight:bold;line-height:1.4;text-decoration:none;">${safeAction} &rarr;</a>
          </td></tr></table>
          <p style="margin:32px 0 8px;color:#525252;font-size:13px;line-height:1.6;">Button not working? Copy this link into your browser:</p>
          <p style="margin:0;overflow-wrap:anywhere;word-break:break-all;font-size:13px;line-height:1.6;"><a href="${safeUrl}" style="color:#6E11B0;text-decoration:underline;">${safeUrl}</a></p>
        </td></tr>
        <tr><td style="padding:28px 4px 0;color:#525252;font-size:13px;line-height:1.6;">
          ${note}<br><span style="color:#6E11B0;">one post, every day.</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function verificationEmail(to: string, url: string): ResendAuthEmail {
  return authenticationEmail(to, "Verify your Dayli email", "One more step.", "Verify your email address to continue.", "Verify email", url);
}

export function passwordResetEmail(to: string, url: string): ResendAuthEmail {
  return authenticationEmail(to, "Reset your Dayli password", "A fresh start.", "Reset your password using this link.", "Reset password", url);
}

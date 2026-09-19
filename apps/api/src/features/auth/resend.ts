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

function authenticationEmail(to: string, subject: string, intro: string, url: string): ResendAuthEmail {
  const safeUrl = escapeHtml(url);
  return {
    to,
    subject,
    text: `${intro}\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${safeUrl}">Continue</a></p><p>If you did not request this, you can ignore this email.</p>`,
  };
}

export function verificationEmail(to: string, url: string): ResendAuthEmail {
  return authenticationEmail(to, "Verify your Dayli email", "Verify your email address to continue.", url);
}

export function passwordResetEmail(to: string, url: string): ResendAuthEmail {
  return authenticationEmail(to, "Reset your Dayli password", "Reset your password using this link.", url);
}

const googlePublicBindingNames = [
  "STAGING_GOOGLE_WEB_CLIENT_ID",
  "STAGING_GOOGLE_IOS_CLIENT_ID",
  "STAGING_GOOGLE_ANDROID_CLIENT_ID",
];

const workerGoogleBindingNames = [
  "GOOGLE_WEB_CLIENT_ID",
  "GOOGLE_IOS_CLIENT_ID",
  "GOOGLE_ANDROID_CLIENT_ID",
];

export const requiredWorkerSecretNames = {
  betterAuth: "BETTER_AUTH_SECRET",
  google: "GOOGLE_CLIENT_SECRET",
  resend: "RESEND_API_KEY",
};

function optionalPublicValue(environment, name, maximumLength) {
  const value = environment[name];
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.trim() !== value || value.length > maximumLength || /[\r\n]/.test(value)) {
    throw new Error(`${name} must be a non-blank single-line value.`);
  }
  return value;
}

function validateResendFrom(value) {
  if (!/^.+ <[^<>\s@]+@[^<>\s@]+>$/.test(value)) {
    throw new Error("STAGING_RESEND_FROM must be a display name and email address.");
  }
}

/**
 * Read public provider bindings without logging their values. A provider is
 * either completely absent or complete so a generated Worker version cannot
 * make Better Auth reject every authentication route due to a partial tuple.
 */
export function readStagingAuthBindings(environment) {
  const googleValues = googlePublicBindingNames.map((name) => optionalPublicValue(environment, name, 512));
  const resendFrom = optionalPublicValue(environment, "STAGING_RESEND_FROM", 320);
  const googleEnabled = googleValues.some(Boolean);

  if (googleEnabled && googleValues.some((value) => value === undefined)) {
    throw new Error("All three staging Google client ID variables must be set together.");
  }
  if (resendFrom) validateResendFrom(resendFrom);

  const vars = {};
  const requiredSecrets = [requiredWorkerSecretNames.betterAuth];
  if (googleEnabled) {
    for (const [index, bindingName] of workerGoogleBindingNames.entries()) {
      vars[bindingName] = googleValues[index];
    }
    requiredSecrets.push(requiredWorkerSecretNames.google);
  }
  if (resendFrom) {
    vars.RESEND_FROM = resendFrom;
    requiredSecrets.push(requiredWorkerSecretNames.resend);
  }

  return { vars, requiredSecrets };
}

/** Extract only secret binding names from Cloudflare's read-only list response. */
export function readCloudflareSecretNames(payload) {
  if (!Array.isArray(payload?.result) || !payload.result.every((secret) => typeof secret?.name === "string")) {
    throw new Error("Cloudflare returned an invalid Worker secret binding list.");
  }
  return new Set(payload.result.map((secret) => secret.name));
}

/** Ensure a deploy never introduces public provider bindings without their secret binding names. */
export function assertRequiredWorkerSecrets(secretNames, requiredSecrets) {
  for (const name of requiredSecrets) {
    if (!secretNames.has(name)) {
      throw new Error(`The staging Worker is missing required secret binding ${name}.`);
    }
  }
}

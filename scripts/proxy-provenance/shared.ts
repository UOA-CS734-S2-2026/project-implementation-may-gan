export interface DiagnosticEnv {
  PROBE_TOKEN: string;
  HASH_KEY: string;
  EXPIRES_AT: string;
  EXPECTED_ZONE: string;
  RECEIVER_ORIGIN?: string;
}

export const syntheticSources = { a: "203.0.113.10", b: "198.51.100.20" } as const;

export function active(env: DiagnosticEnv, now = Date.now()): boolean {
  const expires = Date.parse(env.EXPIRES_AT);
  return Number.isFinite(expires) && now < expires && env.PROBE_TOKEN?.length >= 40 && env.HASH_KEY?.length >= 40;
}

export function authorized(request: Request, env: DiagnosticEnv): boolean {
  const expected = `Bearer ${env.PROBE_TOKEN}`;
  const actual = request.headers.get("authorization") ?? "";
  let difference = expected.length ^ actual.length;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ (actual.charCodeAt(i) || 0);
  return difference === 0;
}

export function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
}

export async function fingerprint(value: string | null, key: string): Promise<string | null> {
  if (!value) return null;
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function matchesSynthetic(value: string | null): "a" | "b" | null {
  return value === syntheticSources.a ? "a" : value === syntheticSources.b ? "b" : null;
}

/** The fragment is read in memory, removed from the address bar, and never persisted. */
export function samplePage(): Response {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const script = `
    const token = location.hash.slice(1);
    history.replaceState(null, '', location.pathname);
    const output = document.getElementById('output');
    document.getElementById('sample').onclick = async () => {
      if (!/^[a-f0-9]{64}$/.test(token)) { output.textContent = 'Open the private link supplied for this test.'; return; }
      output.textContent = 'Checking...';
      try {
        const result = await fetch('/sample', {headers: {Authorization: 'Bearer ' + token}, credentials: 'omit', cache: 'no-store', redirect: 'error'});
        output.textContent = JSON.stringify(await result.json(), null, 2);
      } catch { output.textContent = 'Request failed. Tell the operator; do not retry repeatedly.'; }
    };
  `;
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Temporary source identity check</title><h1>Temporary source identity check</h1><p>No login is needed. This checks request metadata using the app's source-selection function. It does not access the app or database.</p><p>Click once on Wi-Fi, then open the original private link on your phone with Wi-Fi off and click once using mobile data. Send the displayed JSON to the operator, labelled by network. Do not share the private link publicly.</p><button id="sample">Check this network</button><pre id="output"></pre><script nonce="${nonce}">${script}</script></html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
    },
  });
}

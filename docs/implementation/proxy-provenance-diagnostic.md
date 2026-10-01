# Temporary source-provenance diagnostic

This diagnostic checks the Cloudflare metadata used by `selectBrowserSource()` without sending traffic to the app. The owner authorized its staging setup on 2026-10-01. It does not change the live proxy's source policy.

## What runs

`scripts/proxy-provenance/receiver.ts` imports the production selector directly. It returns HMAC-SHA-256 identity fingerprints, address family, and a fixed set of flags. It never returns visitor IPs, cookies, authorization values, or copied request headers.

`scripts/proxy-provenance/caller.ts` makes one request per invocation to a fixed diagnostic receiver. Its cases set documentation-only IP values, omit or forge `CF-Worker`, and forge forwarding headers. It cannot forward arbitrary URLs or inbound cookies. Redirects are not followed.

Both Workers have random names and new custom hostnames under `staging.dayli.agroupforcoders.com`. The caller also has a workers.dev endpoint to exercise traffic from outside the target zone. Neither Worker has application service bindings, database access, storage bindings, or real rate-limit buckets. Observability and Logpush are disabled in their deployment configs. No request headers or exceptions are logged by the code. Cloudflare may still collect its own platform metadata; this is not a claim that provider-side logging has been disabled everywhere.

The test token and HMAC key are random, short-lived Worker secrets. An absolute six-hour expiry rejects requests with 410 even when the correct token is supplied. Expiry does not delete the Workers, custom domains, or secrets. Run cleanup afterward.

## Local verification

```sh
pnpm install --frozen-lockfile
pnpm test:proxy-provenance
pnpm exec eslint scripts/proxy-provenance.mjs scripts/proxy-provenance
```

The command typechecks the Worker source and runs nine Node tests and a real workerd smoke test. CI and `verify:local` include it. These tests cover the token gate, expiry, output sanitization, HMAC separation, fixed target, redirect handling, and Worker execution. Local workerd does not establish Cloudflare edge header ownership.

## Set up an approved run

Check `wrangler whoami` first. Confirm the account owns the staging Workers and the zone is `agroupforcoders.com`. The setup command requires explicit account and zone IDs and does not reuse a live app Worker name.

```sh
node scripts/proxy-provenance.mjs setup <account-id> <zone-id>
```

It prints the path of a private temporary `state.json`. Keep this path. The directory has mode 0700 and its files have mode 0600. The secrets upload file is removed after setup, including on failure. The state file retains the access token for checks and cleanup; the HMAC key is not retained locally after upload.

A partial setup can leave one Worker deployed. The state file is written before deployment so cleanup remains possible. Inspect Wrangler logs locally if setup fails, but do not publish them without checking for credentials.

## Run the automated comparison

```sh
node scripts/proxy-provenance.mjs check <state-file>
```

The runner makes five direct requests and six requests through each caller endpoint. It saves sanitized JSON beside the state file. It does not retry or exhaust rate limits. A non-200 response is recorded as a status, without copying its body. A failed network request is not a security rejection or a passing test.

A newly created hostname may be in the operating system's negative DNS cache. If Cloudflare's public DNS resolves it but the system resolver does not, use:

```sh
node scripts/proxy-provenance.mjs check <state-file> --public-dns
```

This resolves the diagnostic hostnames through 1.1.1.1 and selects IPv4. TLS still validates the original hostname. It does not change system DNS or bypass certificate validation. An IPv4 fingerprint can differ from an IPv6 fingerprint on the same physical network, so do not treat that difference as two-network proof.

The five direct cases cover an ordinary request, two forged `x-real-ip` values, a forged `CF-Worker`, and a combined forwarding-header forgery. The combined case does not identify which individual header caused an edge rejection.

## Phone and computer check

The private link is in `private-browser-link.txt` beside the state file. It contains a token in the URL fragment, not the query string. Do not commit or publish it.

1. Open the private link on the computer and click **Check this network**.
2. Open the original private link on the phone with Wi-Fi off and mobile data enabled. Click the same button.
3. Send the displayed JSON to the operator, labelled by device and network. No login is needed.

The page removes the fragment from the address bar and retains the token only in memory. Reopen the original private link after refreshing. It does not set cookies, store tokens in local storage, or send cookies with the sample request. The test has no server-side results store, so the operator needs the displayed JSON.

Compare `sourceKeyHash`, `sourceFamily`, and `cfWorker` within the same run. A second run has a new HMAC key and cannot be compared with the first. VPNs, browser privacy relays, shared egress, and address-family changes can affect the result. A successful sample proves selector behavior, not actual rate-limit bucket enforcement or login/session behavior.

## Cleanup

```sh
node scripts/proxy-provenance.mjs cleanup <state-file>
```

This deletes only the two validated diagnostic Worker names. After each successful deletion it records progress, allowing a retry if the second deletion fails. Once both succeed it removes the local access token and private link. Sanitized reports remain.

Verify the two custom domains are absent in Cloudflare and check for leftover diagnostic DNS records. The local Wrangler OAuth token may lack DNS-record read permission even though it can manage Worker custom domains. If a Worker was already deleted manually, finish the other deletion and remove the private local files manually rather than changing the script to target an app Worker.

## Deployed observations on 2026-10-01

The assistant implemented and ran this diagnostic directly, without a sub-agent. Local tests, focused lint, and strict typechecking of the Worker source passed. A deployed Chromium check also passed and confirmed fragment removal and a sanitized sample response.

| Case | Observed behavior |
| --- | --- |
| Direct request | Selector accepted; `CF-Worker` absent; legitimate `x-real-ip` present |
| Direct forged `x-real-ip`, two values | Selected identity unchanged; neither synthetic identity selected |
| Direct forged `CF-Worker` | Marker absent at the receiver |
| Direct combined forwarding forgery | 403 from the edge; no receiver observation returned |
| Same-zone caller with two `x-real-ip` values | Both synthetic identities selected; different source fingerprints |
| Same-zone caller omitting or forging `CF-Worker` | Receiver still saw the same-zone marker |
| workers.dev caller, all six cases | Fixed Cloudflare Worker address selected; marker classified as other |

The same-zone baseline also selected the fixed Cloudflare Worker address when the caller did not supply `x-real-ip`. The `fixedCrossZoneIp` flag names a known constant, not a reliable classification of the caller's zone.

The Worker-origin issue is now reproduced at the edge using the real selector. `CF-Worker` is a candidate for rejecting these requests because Cloudflare restored the marker in the tested cases. This diagnostic does not implement or establish a complete rejection policy. The live app, public API, vinext adapter, named service binding, session cookies, and rate-limit decisions were not exercised by these probes.

### Owner device results and cleanup

The owner supplied labelled PC and mobile results after receiving the Wi-Fi/mobile-data instructions:

| Device | Observed at, UTC | Address family | Result |
| --- | --- | --- | --- |
| PC | 2026-10-01 08:27:08 | IPv6 | Accepted, no Worker marker, no synthetic or fixed Worker identity |
| Mobile | 2026-10-01 08:28:08 | IPv4 | Accepted, no Worker marker, no synthetic or fixed Worker identity |

The two source fingerprints differed within the same run. Both requests included legitimate `x-real-ip` matching the selected identity. This establishes separate selected identities for these samples. It does not prove actual rate-limit enforcement, and the hash difference alone cannot establish independent physical networks because the address families also differ.

After receiving these results, the assistant ran cleanup successfully. The Cloudflare API confirmed both diagnostic Workers and both custom-domain mappings were absent. Authoritative DNS returned no records for either hostname. A recursive resolver briefly retained the receiver's earlier DNS answer, consistent with caching after deletion. The local token, private link, and convenience symlink were removed. Sanitized reports remain locally; no app Worker or database was changed.

## Mitigation follow-up, 2026-10-01

The implementation now rejects any present `CF-Worker` header, including an empty value, before the web proxy dispatches or the public API constructs its application. Those endpoints return a no-store 403. The source selector also rejects the marker, and server-side session/profile request construction preserves it rather than laundering an incoming Worker request into a browser request. The refresh route preserves the marker too; it maps the rejected upstream result to its existing no-cookie 502 failure response. Public landing HTML may still render, but no authenticated session/profile fetch occurs for marked requests.

The private `BrowserProxyEntrypoint` remains separate from the public API fetch handler. Legitimate `x-real-ip` headers are still allowed. This policy deliberately does not support public API calls from other Cloudflare Workers, including Worker-hosted monitors or integrations. There is no Worker-zone allowlist. Scheduled handlers, direct native bearer clients, and direct ticket WebSockets do not use that incoming-Worker path. R2 upload code is unchanged.

A second temporary edge run exercised the patched production selector. All six same-zone cases and all six workers.dev cases were rejected by the selector, including omission and forgery of the Worker marker. Ordinary direct requests and direct marker/header forgery cases remained accepted with the edge-owned identity. The combined direct forwarding forgery still received an edge 403. The diagnostic itself returns 200 for a successfully collected observation; `selectorAccepted: false` is the rejection evidence, not an application HTTP response.

The second pair of diagnostic Workers was deleted after collection. API inventory and authoritative DNS confirmed cleanup. No new phone test was requested, and the live application Workers were not deployed by this verification.

Local verification passed: 461 API tests, 150 web tests, two real workerd proxy tests, and ten diagnostic tests including workerd. The proxy integration fixture now compiles the real production web proxy instead of copying its forwarding logic. The complete `pnpm verify:local` run passed, including build, generated clients, Flutter, and isolated PostgreSQL checks. Application rollout and deployed vinext/session compatibility checks remain pending.

References:

- [Cloudflare visitor IP behavior](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip-in-worker-subrequests)
- [Cloudflare CF-Worker header](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-worker)

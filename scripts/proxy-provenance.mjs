#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Resolver } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = join(root, "apps/api/node_modules/wrangler/bin/wrangler.js");
const variantNames = ["baseline", "x-real-a", "x-real-b", "remove-worker", "forge-worker", "forge-forwarded"];
const syntheticA = "203.0.113.10";
const syntheticB = "198.51.100.20";

function save(path, value) {
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}

function run(args, accountId) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CI: "true", WRANGLER_SEND_METRICS: "false" },
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    // Do not forward arbitrary Wrangler error output into a retained diagnostic report.
    throw new Error(`Wrangler ${args[0]} failed. Inspect local Wrangler logs without sharing credentials.`);
  }
  return result.stdout;
}

function stateAt(path) {
  const state = JSON.parse(readFileSync(resolve(path), "utf8"));
  if (state.version !== 1 || !/^[a-f0-9]{12}$/.test(state.id) || !/^[a-f0-9]{32}$/.test(state.accountId)
    || state.zone !== "agroupforcoders.com" || !/^[a-f0-9]{32}$/.test(state.zoneId)) throw new Error("Invalid diagnostic state.");
  const suffix = `.staging.dayli.${state.zone}`;
  if (state.receiverName !== `dayli-provenance-receiver-${state.id}` || state.callerName !== `dayli-provenance-caller-${state.id}`
    || state.receiverOrigin !== `https://proxy-probe-${state.id}${suffix}`
    || state.callerOrigin !== `https://proxy-probe-caller-${state.id}${suffix}`) throw new Error("Refusing a non-diagnostic target.");
  if (state.workersDevOrigin && !new RegExp(`^https://${state.callerName}\\.[a-z0-9-]+\\.workers\\.dev$`).test(state.workersDevOrigin)) throw new Error("Invalid diagnostic workers.dev target.");
  return state;
}

function config(state, role) {
  return {
    name: role === "receiver" ? state.receiverName : state.callerName,
    account_id: state.accountId,
    main: join(root, `scripts/proxy-provenance/${role}.ts`),
    compatibility_date: "2026-09-27",
    workers_dev: role === "caller",
    preview_urls: false,
    observability: { enabled: false, logs: { enabled: false, invocation_logs: false } },
    logpush: false,
    routes: [{ pattern: new URL(role === "receiver" ? state.receiverOrigin : state.callerOrigin).hostname, custom_domain: true, zone_id: state.zoneId }],
    vars: { EXPECTED_ZONE: state.zone, EXPIRES_AT: state.expiresAt, ...(role === "caller" ? { RECEIVER_ORIGIN: state.receiverOrigin } : {}) },
  };
}

async function setup(accountId, zoneId) {
  if (!/^[a-f0-9]{32}$/.test(accountId ?? "") || !/^[a-f0-9]{32}$/.test(zoneId ?? "")) throw new Error("setup requires an explicit account ID and agroupforcoders.com zone ID.");
  const dir = mkdtempSync(join(tmpdir(), "dayli-provenance-"));
  chmodSync(dir, 0o700);
  const id = randomBytes(6).toString("hex");
  const zone = "agroupforcoders.com";
  const state = {
    version: 1, id, accountId, zoneId, zone,
    receiverName: `dayli-provenance-receiver-${id}`,
    callerName: `dayli-provenance-caller-${id}`,
    receiverOrigin: `https://proxy-probe-${id}.staging.dayli.${zone}`,
    callerOrigin: `https://proxy-probe-caller-${id}.staging.dayli.${zone}`,
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    token: randomBytes(32).toString("hex"),
  };
  const stateFile = join(dir, "state.json");
  save(stateFile, state);
  console.log(`Diagnostic state: ${stateFile}`);
  const secrets = join(dir, "secrets.json");
  save(secrets, { PROBE_TOKEN: state.token, HASH_KEY: randomBytes(32).toString("hex") });
  try {
    for (const role of ["receiver", "caller"]) {
      const path = join(dir, `${role}.json`);
      save(path, config(state, role));
      const output = run(["deploy", "--config", path, "--secrets-file", secrets], accountId);
      if (role === "caller") state.workersDevOrigin = output.match(new RegExp(`https://${state.callerName}\\.[a-z0-9-]+\\.workers\\.dev`))?.[0];
      save(stateFile, state);
      console.log(`Deployed temporary ${role}: ${role === "caller" ? state.callerOrigin : state.receiverOrigin}`);
    }
  } finally {
    rmSync(secrets, { force: true });
  }
  save(join(dir, "private-browser-link.txt"), state.receiverOrigin + "/#" + state.token + "\n");
  console.log(`Private test link saved in ${join(dir, "private-browser-link.txt")}. Do not commit or publish it.`);
  console.log(`Expires at ${state.expiresAt}. Expiry disables requests; cleanup is still required.`);
}

async function requestSample(url, token, extraHeaders = {}, publicDns = false) {
  // Optional public DNS avoids a stale OS negative cache after creating a hostname.
  // TLS still validates the original hostname. No Host override or certificate bypass.
  const resolver = new Resolver();
  resolver.setServers(["1.1.1.1"]);
  const lookup = publicDns ? (hostname, options, callback) => {
    resolver.resolve4(hostname).then(
      (addresses) => options.all ? callback(null, addresses.map((address) => ({ address, family: 4 }))) : callback(null, addresses[0], 4),
      (error) => callback(error),
    );
  } : undefined;
  return await new Promise((resolveResult) => {
    const req = httpsRequest(url, { headers: { authorization: `Bearer ${token}`, ...extraHeaders }, lookup, agent: false, signal: AbortSignal.timeout(15000) }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolveResult({ status: res.statusCode }); return; }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; if (body.length > 32768) req.destroy(new Error("oversized response")); });
      res.on("error", () => resolveResult({ error: "diagnostic_fetch_failed" }));
      res.on("end", () => {
        try { resolveResult({ status: 200, result: JSON.parse(body) }); }
        catch { resolveResult({ error: "invalid_diagnostic_response" }); }
      });
    });
    req.on("error", () => resolveResult({ error: "diagnostic_fetch_failed" }));
    req.end();
  });
}

async function check(path, dnsOption) {
  if (dnsOption && dnsOption !== "--public-dns") throw new Error("Only --public-dns is supported after the state file.");
  const publicDns = dnsOption === "--public-dns";
  const state = stateAt(path);
  if (Date.parse(state.expiresAt) <= Date.now()) throw new Error("Diagnostic expired. Clean it up.");
  const cases = [];
  for (const [label, headers] of [
    ["direct", {}],
    ["direct-forged-x-real-a", { "x-real-ip": syntheticA }],
    ["direct-forged-x-real-b", { "x-real-ip": syntheticB }],
    ["direct-forged-cf-worker", { "cf-worker": "forged.invalid" }],
    ["direct-forged-forwarding", { "cf-connecting-ip": syntheticA, "x-forwarded-for": syntheticB, forwarded: `for=${syntheticB}` }],
  ]) cases.push({ label, ...await requestSample(state.receiverOrigin + "/sample", state.token, headers, publicDns) });
  for (const [kind, origin] of [["same-zone-caller", state.callerOrigin], ["workers-dev-caller", state.workersDevOrigin]]) {
    if (!origin) { cases.push({ label: kind, skipped: "no endpoint discovered; not a cross-zone proof" }); continue; }
    for (const variant of variantNames) cases.push({ label: `${kind}:${variant}`, ...await requestSample(`${origin}/run?variant=${variant}`, state.token, {}, publicDns) });
  }
  const observation = (label) => {
    const item = cases.find((entry) => entry.label === label);
    return item?.status === 200 ? item.result?.observation ?? item.result : undefined;
  };
  const first = observation("same-zone-caller:x-real-a");
  const second = observation("same-zone-caller:x-real-b");
  const incomplete = cases.some((item) => item.error || item.skipped || (item.status !== 200 && !(item.label === "direct-forged-forwarding" && item.status === 403)));
  const report = {
    observedAt: new Date().toISOString(), expiresAt: state.expiresAt, receiverOrigin: state.receiverOrigin,
    dns: publicDns ? "1.1.1.1" : "system",
    collectionComplete: !incomplete,
    sameZoneCanChooseSource: first && second ? first.selectedSynthetic === "a" && second.selectedSynthetic === "b" && first.sourceKeyHash !== second.sourceKeyHash : null,
    cases,
  };
  const reportPath = join(dirname(resolve(path)), `report-${Date.now()}.json`);
  save(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Sanitized evidence: ${reportPath}`);
  if (incomplete) process.exitCode = 1;
}

function cleanup(path) {
  const state = stateAt(path);
  const dir = dirname(resolve(path));
  // Regenerate minimal delete configs from validated identities, not a mutable local config path.
  for (const role of ["caller", "receiver"]) {
    if (state.deleted?.includes(role)) continue;
    const file = join(dir, `delete-${role}.json`);
    save(file, { name: role === "caller" ? state.callerName : state.receiverName, account_id: state.accountId });
    run(["delete", "--config", file], state.accountId);
    state.deleted = [...(state.deleted ?? []), role];
    save(resolve(path), state);
    console.log(`Deleted temporary ${role} Worker.`);
  }
  rmSync(join(dir, "private-browser-link.txt"), { force: true });
  rmSync(resolve(path));
  console.log("Removed local access token. Sanitized reports remain. Verify custom domains and DNS cleanup in Cloudflare.");
}

try {
  const [command, first, second] = process.argv.slice(2);
  if (command === "setup") await setup(first, second);
  else if (command === "check" && first) await check(first, second);
  else if (command === "cleanup" && first) cleanup(first);
  else throw new Error("Usage: node scripts/proxy-provenance.mjs setup <account-id> <zone-id> | check <state-file> [--public-dns] | cleanup <state-file>");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Diagnostic command failed.");
  process.exitCode = 1;
}

import assert from "node:assert/strict";
import test from "node:test";
import { awaitRpcDeployment, awaitStagingRevision } from "../apps/api/test/rpc-deployment-readiness";

test("retries the exact previous-receiver signal until the new method is available", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await awaitRpcDeployment("proveStagingRevision", async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('The RPC receiver does not implement the method "proveStagingRevision".');
    return { revision: "a".repeat(40) };
  }, { wait: async (milliseconds) => { waits.push(milliseconds); } });

  assert.deepEqual(result, { revision: "a".repeat(40) });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2_000]);
});

test("does not reinterpret role, connection, or unrelated receiver failures as deployment lag", async () => {
  for (const error of [
    new Error("Post Trash worker fencing proof failed."),
    new TypeError('The RPC receiver does not implement the method "proveConnection".'),
    new TypeError('The RPC receiver does not implement the method "provePostTrashWorkerFence".'),
  ]) {
    let waited = false;
    await assert.rejects(() => awaitRpcDeployment("proveStagingRevision", async () => { throw error; }, {
      wait: async () => { waited = true; },
    }), (received) => received === error);
    assert.equal(waited, false);
  }
});

test("fails with a sanitized bounded timeout while the previous receiver remains active", async () => {
  let clock = 0;
  let calls = 0;
  await assert.rejects(() => awaitRpcDeployment("provePostTrashWorkerFence", async () => {
    calls += 1;
    throw new TypeError('The RPC receiver does not implement the method "provePostTrashWorkerFence".');
  }, {
    timeoutMs: 10, retryMs: 5, now: () => clock, wait: async () => { clock += 5; },
  }), /private staging RPC deployment did not become ready/);
  assert.equal(calls, 2);
});

test("caps a non-divisible retry interval and never invokes RPC after the deadline", async () => {
  let clock = 0;
  const invocationTimes: number[] = [];
  const waits: number[] = [];
  await assert.rejects(() => awaitRpcDeployment("proveStagingRevision", async () => {
    invocationTimes.push(clock);
    throw new TypeError('The RPC receiver does not implement the method "proveStagingRevision".');
  }, {
    timeoutMs: 45, retryMs: 2, now: () => clock,
    wait: async (milliseconds) => { waits.push(milliseconds); clock += milliseconds; },
  }), /private staging RPC deployment did not become ready/);

  assert.equal(clock, 45);
  assert.equal(invocationTimes.at(-1), 44);
  assert.equal(invocationTimes.every((time) => time < 45), true);
  assert.equal(waits.at(-1), 1);
});

const expectedProof = { revision: "a".repeat(40), storageDigest: "b".repeat(64) };

test("waits for the captured revision when an older Worker returns a valid proof", async () => {
  let calls = 0;
  let clock = 0;
  const proof = await awaitStagingRevision(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('The RPC receiver does not implement the method "proveStagingRevision".');
    return calls === 2 ? { ...expectedProof, revision: "c".repeat(40) } : expectedProof;
  }, expectedProof, { now: () => clock, wait: async (milliseconds) => { clock += milliseconds; } });
  assert.deepEqual(proof, expectedProof);
  assert.equal(calls, 3);
  assert.equal(clock, 4_000);
});

test("never accepts a persistent revision mismatch and stops at the deadline", async () => {
  let clock = 0;
  const times: number[] = [];
  await assert.rejects(() => awaitStagingRevision(async () => {
    times.push(clock);
    return { ...expectedProof, revision: "c".repeat(40) };
  }, expectedProof, {
    timeoutMs: 5, retryMs: 2, now: () => clock,
    wait: async (milliseconds) => { clock += milliseconds; },
  }), /private staging RPC deployment did not become ready/);
  assert.deepEqual(times, [0, 2, 4]);
  assert.equal(clock, 5);
});

test("fails immediately on storage mismatch even when the revision is old", async () => {
  let calls = 0;
  let waits = 0;
  await assert.rejects(() => awaitStagingRevision(async () => {
    calls += 1;
    return { revision: "c".repeat(40), storageDigest: "d".repeat(64) };
  }, expectedProof, { wait: async () => { waits += 1; } }), /storage attribution does not match/);
  assert.equal(calls, 1);
  assert.equal(waits, 0);
});

test("does not retry malformed attribution or application failures", async () => {
  for (const revision of ["", "invalid", "A".repeat(40)]) {
    await assert.rejects(() => awaitStagingRevision(async () => ({ ...expectedProof, revision }), expectedProof, {
      wait: async () => { assert.fail("Invalid attribution must not be retried."); },
    }), /release attribution is invalid/);
  }
  const error = new Error("Staging release attribution is unavailable.");
  await assert.rejects(() => awaitStagingRevision(async () => { throw error; }, expectedProof, {
    wait: async () => { assert.fail("Application failures must not be retried."); },
  }), (received) => received === error);
});

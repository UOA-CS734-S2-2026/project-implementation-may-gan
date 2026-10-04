import assert from "node:assert/strict";
import test from "node:test";
import { awaitRpcDeployment } from "../apps/api/test/rpc-deployment-readiness";

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
  assert.equal(calls, 3);
});

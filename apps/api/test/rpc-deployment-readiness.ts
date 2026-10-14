const deploymentMethods = new Set(["proveStagingRevision", "provePostTrashWorkerFence", "provePostTrashCleanupAdmission"]);

export interface RpcDeploymentReadinessOptions {
  timeoutMs?: number;
  retryMs?: number;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}

class PreviousDeploymentRevisionError extends Error {}

function isPreviousDeploymentReceiver(error: unknown, method: string): boolean {
  return deploymentMethods.has(method) && error instanceof TypeError &&
    error.message === `The RPC receiver does not implement the method "${method}".`;
}

/**
 * A Worker service binding can briefly resolve to the previous deployment after
 * Wrangler reports success. Retry only the exact stale-receiver signal or a
 * validated previous revision. Role, database, storage, and application failures
 * remain immediate failures.
 */
export async function awaitRpcDeployment<T>(
  method: "proveStagingRevision" | "provePostTrashWorkerFence" | "provePostTrashCleanupAdmission",
  invoke: () => Promise<T>,
  options: RpcDeploymentReadinessOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const retryMs = options.retryMs ?? 2_000;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + timeoutMs;
  let attempted = false;

  for (;;) {
    if (attempted && now() >= deadline) {
      throw new Error("The private staging RPC deployment did not become ready before the deadline.");
    }
    attempted = true;
    try {
      return await invoke();
    } catch (error) {
      if (!isPreviousDeploymentReceiver(error, method) &&
        !(method === "proveStagingRevision" && error instanceof PreviousDeploymentRevisionError)) throw error;
      const remainingMs = deadline - now();
      if (remainingMs <= 0) throw new Error("The private staging RPC deployment did not become ready before the deadline.");
      await wait(Math.min(retryMs, remainingMs));
    }
  }
}

export interface StagingRevisionProof {
  revision: string;
  storageDigest: string;
}

/** Wait for the captured revision without accepting a different storage target. */
export async function awaitStagingRevision(
  invoke: () => Promise<StagingRevisionProof>,
  expected: StagingRevisionProof,
  options: RpcDeploymentReadinessOptions = {},
): Promise<StagingRevisionProof> {
  if (!/^[a-f0-9]{40}$/.test(expected.revision) || !/^[a-f0-9]{64}$/.test(expected.storageDigest)) {
    throw new Error("Staging release expectations are invalid.");
  }
  return awaitRpcDeployment("proveStagingRevision", async () => {
    const proof = await invoke();
    if (!proof || typeof proof.revision !== "string" || !/^[a-f0-9]{40}$/.test(proof.revision) ||
      typeof proof.storageDigest !== "string" || !/^[a-f0-9]{64}$/.test(proof.storageDigest)) {
      throw new Error("Staging release attribution is invalid.");
    }
    if (proof.storageDigest !== expected.storageDigest) {
      throw new Error("Staging storage attribution does not match the captured release.");
    }
    if (proof.revision !== expected.revision) throw new PreviousDeploymentRevisionError();
    return proof;
  }, options);
}

const deploymentMethods = new Set(["proveStagingRevision", "provePostTrashWorkerFence", "provePostTrashCleanupAdmission"]);

export interface RpcDeploymentReadinessOptions {
  timeoutMs?: number;
  retryMs?: number;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}

function isPreviousDeploymentReceiver(error: unknown, method: string): boolean {
  return deploymentMethods.has(method) && error instanceof TypeError &&
    error.message === `The RPC receiver does not implement the method "${method}".`;
}

/**
 * A Worker service binding can briefly resolve to the previous deployment after
 * Wrangler reports success. Retry only that exact stale-receiver signal. Role,
 * database, attribution, and application failures remain immediate failures.
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
      if (!isPreviousDeploymentReceiver(error, method)) throw error;
      const remainingMs = deadline - now();
      if (remainingMs <= 0) throw new Error("The private staging RPC deployment did not become ready before the deadline.");
      await wait(Math.min(retryMs, remainingMs));
    }
  }
}

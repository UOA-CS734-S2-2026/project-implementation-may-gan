import type { Context } from "hono";

export interface ImmediateDispatchDependencies {
  /** Creates a fresh delivery runtime for each post-commit invocation. */
  dispatchImmediately?: () => Promise<unknown>;
}

/** Schedule only after a route's transactional service call has resolved. */
export function scheduleImmediateDispatch(context: Context, dependencies: ImmediateDispatchDependencies): void {
  if (!dependencies.dispatchImmediately) return;
  context.executionCtx.waitUntil(dependencies.dispatchImmediately().catch(() => undefined));
}

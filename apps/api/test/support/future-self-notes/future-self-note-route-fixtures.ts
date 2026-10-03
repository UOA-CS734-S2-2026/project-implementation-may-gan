import { createAucklandDayService } from "@dayli/domain";
import { createApp } from "../../../src/app";
import { createMemoryFutureSelfNoteStore } from "../../../src/features/future-self-notes/shared/future-self-note.memory-store";
import { createFutureSelfNoteService } from "../../../src/features/future-self-notes/shared/future-self-note.service";

type FutureSelfNotesDependencies = NonNullable<NonNullable<Parameters<typeof createApp>[0]>["futureSelfNotes"]>;

/** 14:00 on 3 October 2026 in Auckland (UTC+13). */
export const routeTestNow = new Date("2026-10-03T01:00:00.000Z");

/** A composed app over an in-memory store. Bearer tokens are user IDs; IDs starting `no-username` lack a handle. */
export function createFutureSelfNoteRouteFixture(options: { now?: Date; withoutService?: boolean } = {}) {
  const clock = { current: options.now ?? routeTestNow, now() { return this.current; } };
  const memory = createMemoryFutureSelfNoteStore();
  let ids = 0;
  const dependencies = {
    resolveSession: async (request: Request) => {
      const header = request.headers.get("authorization");
      const userId = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
      return userId ? { userId } : null;
    },
    hasUsername: async (userId: string) => !userId.startsWith("no-username"),
    service: options.withoutService ? undefined : createFutureSelfNoteService({
      store: memory.store,
      clock,
      dayService: createAucklandDayService(clock),
      generateId: () => `note-${++ids}`,
    }),
  } satisfies FutureSelfNotesDependencies;
  const app = createApp({ futureSelfNotes: dependencies });

  function request(path: string, init: { method?: string; user?: string; key?: string | null; json?: unknown } = {}) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (init.user !== undefined) headers.authorization = `Bearer ${init.user}`;
    if (init.key !== undefined && init.key !== null) headers["idempotency-key"] = init.key;
    return app.request(path, {
      method: init.method ?? "GET",
      headers,
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
  }

  return { app, clock, memory, request };
}

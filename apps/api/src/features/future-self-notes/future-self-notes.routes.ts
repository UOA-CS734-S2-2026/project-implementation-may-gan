import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthenticatedApiEnv } from "../../http/authenticated-actor";
import type { ActorRateLimiter } from "../../http/middleware/rate-limit";
import { createRequireSession, type ResolveSession } from "../../http/middleware/require-session";
import { createRequireUsername, type HasUsername } from "../../http/middleware/require-username";
import { registerCreateFutureSelfNoteRoute } from "./create-future-self-note/create-future-self-note.route";
import { registerDeleteFutureSelfNoteRoute } from "./delete-future-self-note/delete-future-self-note.route";
import { registerGetFutureSelfNoteRoute } from "./get-future-self-note/get-future-self-note.route";
import { registerListFutureSelfNotesRoute } from "./list-future-self-notes/list-future-self-notes.route";
import type { FutureSelfNoteService } from "./shared/future-self-note.service";
import { registerUpdateFutureSelfNoteRoute } from "./update-future-self-note/update-future-self-note.route";

export interface FutureSelfNotesRouteDependencies {
  /** Resolves the Better Auth cookie or bearer session; never trusts a request-supplied user. */
  resolveSession: ResolveSession;
  service?: FutureSelfNoteService;
  /** Notes need a chosen username. Omit only where username lookup is not composed. */
  hasUsername?: HasUsername;
  rateLimiter?: ActorRateLimiter;
}

/** Register future-self note actions. Every path needs a session and a completed username. */
export function registerFutureSelfNotesRoutes(app: OpenAPIHono<AuthenticatedApiEnv>, dependencies: FutureSelfNotesRouteDependencies) {
  for (const path of ["/api/v1/future-self-notes", "/api/v1/future-self-notes/:noteId"]) {
    app.use(path, createRequireSession(dependencies.resolveSession, dependencies.rateLimiter));
    app.use(path, createRequireUsername(dependencies.hasUsername, "Choose a username before writing to your future self."));
  }
  registerCreateFutureSelfNoteRoute(app, dependencies);
  registerListFutureSelfNotesRoute(app, dependencies);
  registerGetFutureSelfNoteRoute(app, dependencies);
  registerUpdateFutureSelfNoteRoute(app, dependencies);
  registerDeleteFutureSelfNoteRoute(app, dependencies);
}

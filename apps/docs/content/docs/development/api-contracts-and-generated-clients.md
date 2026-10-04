---
title: API contracts and generated clients
description: Change Dayli's HTTP agreement and keep the web and mobile clients in step with it.
---

# API contracts and generated clients

An API contract is the agreement between a server and its callers. It answers concrete questions: which method and path should a client use, what may it send, which status codes can come back, and what shape does each response have?

That agreement matters even when every project uses TypeScript. The web app, mobile app, and deployed API do not update as one process. Someone can keep an older mobile build installed while the server changes underneath it. A field rename can therefore compile perfectly in the new backend and still break a phone that has not updated. Computers are annoyingly literal about this sort of thing.

Dayli describes its product API with Zod schemas and Hono route definitions. Those definitions produce an OpenAPI document, which OpenAPI Generator turns into TypeScript and Dart clients. The generated code removes a lot of repetitive request code, but it does not remove the need to design, review, and test the agreement.

## What belongs in the agreement

A complete endpoint contract includes more than a JSON interface:

- the HTTP method and path, such as `POST /api/v1/posts`
- path, query, header, and JSON request fields
- whether each field is required, optional, or nullable
- formats and limits, such as an integer range or a date-only string
- each possible status code and the response body for that status
- a stable operation ID, which becomes a generated client method
- authentication schemes advertised to callers

Required, optional, and nullable are different. A required nullable field must appear, but its value may be `null`. An optional field may be absent. Changing one into another can alter generated types and decoders, so spell out the behavior rather than treating all three as "maybe a value."

The contract is also not the business operation. A schema can reject a rating outside its numeric range. It cannot decide whether the authenticated person has already posted today, because that answer depends on current data. [Backend architecture](./backend-architecture) explains where those deeper rules belong, and [Database](./database) covers constraints that PostgreSQL must enforce.

## Where the Dayli contract lives

Dayli has authored source and generated output. Edit the source. Regenerate the output.

| Path | Role | Edit by hand? |
| --- | --- | --- |
| `packages/contracts/src/` | Shared Zod schemas for identifiers, errors, timestamps, Auckland dates, media, pagination, and other cross-feature shapes. | Yes |
| `apps/api/src/features/<feature>/<action>/*.contract.ts` | Request and response schemas owned by an API action. | Yes |
| `apps/api/src/features/<feature>/<action>/*.route.ts` | Hono method, path, operation ID, request parts, status responses, security metadata, middleware, and handler. | Yes |
| `apps/api/src/app.ts` | Registers feature routes and exposes `/api/v1/openapi.json`. | Yes |
| `scripts/generate-openapi.ts` | Calls the in-process default app and writes the OpenAPI document. | Yes, when changing the generator itself |
| `packages/contracts/openapi.json` | Generated OpenAPI 3.0.3 document. | No |
| `packages/api-client-typescript/` | Generated `typescript-fetch` package used by the web app. | No |
| `packages/api-client-dart/` | Generated Dart package used by Flutter. | No |

The usual feature path is contract, route registration, `apps/api/src/app.ts`, OpenAPI, then both clients:

```text
Zod schema + Hono route
  -> createApp() route registry
  -> packages/contracts/openapi.json
  -> TypeScript client + Dart client
  -> web and mobile wrappers
```

`apps/api/src/app.ts` registers the security schemes and product routes before calling `api.doc(...)`. The exported default `app` has no database or live authentication dependency, which lets `scripts/generate-openapi.ts` request the document in process. Generation does not start a server or contact a deployed environment.

The document only contains routes registered through Hono's OpenAPI registry. Better Auth's `/api/auth/*` compatibility handler is registered as ordinary runtime routing and is not present in `packages/contracts/openapi.json`. A generated contract is therefore not proof that every authentication endpoint exists or works.

Use the current [API reference](/docs/api-reference) to browse generated methods and schemas. Use source files when the reference and a working tree disagree, then regenerate the reference and clients from that source.

## What Zod, Hono, and OpenAPI each do

Zod describes data that may cross the HTTP boundary. Shared schemas such as `aucklandDateSchema` and `utcTimestampSchema` live in `packages/contracts/src/common/time.ts`. Action contracts compose those pieces into named request and response models.

A Hono `createRoute` definition connects schemas to transport details. It declares the method, path, operation ID, request locations, response status codes, and security metadata. `app.openapi(...)` then connects that declaration to the handler.

For requests, Hono's OpenAPI integration parses the declared input at runtime. Handlers read the result through calls such as `context.req.valid("json")`. The default validation hook in `apps/api/src/app.ts` returns `422 VALIDATION_FAILED` when declared request values do not parse.

TypeScript also checks the handler against its declared route while compiling. That catches many mismatched return shapes during development. It is not runtime response validation. A handler can still produce bad data through an unchecked cast, untyped dependency, or later logic mistake. Route tests must exercise representative response bodies and statuses.

OpenAPI is the portable description produced from those route declarations. Generators read it to name methods and model request and response data. OpenAPI does not execute authorization, database rules, or service logic.

The `security` array on a Dayli route advertises bearer token or cookie authentication. Actual session enforcement comes from middleware such as `createRequireSession`, and resource permission belongs to the feature operation or authorized query. Security metadata is documentation, not a permission check.

## A real request and response

Post creation is small enough to trace while still showing the important parts. Its source contract is `apps/api/src/features/posts/create-post/create-post.contract.ts`, and its route is beside it in `create-post.route.ts`.

The request schema includes these fields:

```ts
export const createDailyPostRequestSchema = z.object({
  localDate: aucklandDateSchema,
  promptId: opaqueIdSchema,
  reflectiveAnswer: boundedText(DAILY_POST_LIMITS.reflectiveAnswerMaxCodePoints),
  caption: boundedText(DAILY_POST_LIMITS.captionMaxCodePoints).optional(),
  rating: z.number().int().min(DAILY_POST_LIMITS.ratingMin).max(DAILY_POST_LIMITS.ratingMax),
  audience: postAudienceSchema,
  tomorrowNote: boundedText(DAILY_POST_LIMITS.tomorrowNoteMaxCodePoints).optional(),
  attachments: z.array(opaqueIdSchema).optional(),
}).strict();
```

The real schema adds attachment count and uniqueness checks plus OpenAPI descriptions and examples. `.strict()` rejects unknown JSON keys. `caption` may be omitted in the request. In the returned `DailyPost`, `caption` is required and may be `null`. That distinction gives consumers one predictable response key while allowing a shorter request.

The route supplies the rest of the agreement:

```ts
const createDailyPostRoute = createRoute({
  method: "post",
  path: "/api/v1/posts",
  operationId: "posts.create",
  security,
  request: {
    headers: idempotencyKeyHeaderSchema,
    body: { content: { "application/json": { schema: createDailyPostRequestSchema } }, required: true },
  },
  responses: {
    201: { content: { "application/json": { schema: dailyPostSchema } } },
    ...createDailyPostErrorResponses,
  },
});
```

The declared error responses include `401`, `403`, `409`, `422`, `429`, and `503`. The handler reads the authenticated actor from middleware, reads validated header and JSON values, calls the service, and maps operation outcomes to those statuses. It never accepts an author ID from the body as identity.

`operationId: "posts.create"` becomes the generated `postsCreate` method. The web wrapper in `apps/web/lib/api/daily-posts.ts` calls that method, maps transport exceptions into UI-facing failure variants, and exports selected generated models. UI components do not need to know every generated exception class or status mapping.

The Flutter app uses the same pattern. `apps/mobile/lib/api/posting_day_client.dart` constructs the generated `PostingDaysApi` with bearer authentication, checks the generator's nullable method result, and projects `CurrentPostingDayResponse` into the smaller `PostingDay` model used by the app. Generated clients own HTTP serialization. App wrappers still own session retrieval, error vocabulary, and the model a screen actually needs.

## Dates and nulls need extra care

`2026-09-25` is an Auckland calendar date. It is not midnight UTC and it is not an instant to shift into the device's time zone. Dayli maps OpenAPI `date` to TypeScript `string` and Dart `String` during generation. `scripts/finalize-generated-clients.ts` also corrects Dart JSON conversion for known date-only fields, because the stock generator otherwise treats them as `DateTime` in places.

Timestamps such as `acceptedAt` are different. Generated TypeScript and Dart models represent them as `Date` and `DateTime`, respectively. Check the schema format before doing date arithmetic.

Nullability has caused real generator trouble too. The focused checks in:

- `apps/web/lib/api/generated-nullability.test.ts`
- `apps/mobile/test/generated_client_nullability_test.dart`
- `apps/mobile/test/generated_post_decoding_test.dart`

verify that generated models accept actual `null` values for fields such as post captions, message text, timestamps, and voice memos. The voice memo contract uses an explicit object-or-null union so both generators preserve a required nullable field. Do not paper over a generated nullability mismatch with casts in every caller. Fix the source schema or generation step, then keep a decoding test for the wire value that failed.

## Generate both clients together

Run generation from the repository root. Install the locked dependencies first. The contract workflow needs Node.js 24, the repository's pinned pnpm 10 version, JDK 17 for OpenAPI Generator, and Dart for formatting the Dart package.

Before generation, check whether another change already touched generated paths:

```bash
git status --short -- packages/contracts packages/api-client-typescript packages/api-client-dart
pnpm generate:clients
git diff -- packages/contracts packages/api-client-typescript packages/api-client-dart
```

`pnpm generate:clients` performs this sequence:

1. `scripts/generate-openapi.ts` writes `packages/contracts/openapi.json` from the in-process API app.
2. `scripts/clean-generated-clients.ts` removes both generated client directories.
3. OpenAPI Generator rebuilds the TypeScript `typescript-fetch` client.
4. OpenAPI Generator rebuilds the Dart client.
5. `scripts/finalize-generated-clients.ts` applies repository-owned README, package, formatting, and date-only fixes.
6. Dart formats the generated Dart package when Dart is available.

Because the cleaner removes both packages, never keep handwritten application code inside either generated directory. Put web wrappers under `apps/web` and Flutter wrappers under `apps/mobile`.

Review the OpenAPI and both client diffs together. A changed operation ID can rename generated methods. A required field can change constructors and call sites. A format change can turn a string into a date object. Generated code is verbose, but the model and method diffs usually reveal surprises quickly.

Then run the dedicated contract check:

```bash
pnpm generate:clients:check
```

This command regenerates files before checking them, so it writes to the working tree. It also checks selected bearer-auth, relationship-method, date-only, and Dart formatting invariants. Read [Contracts and generated clients](./testing/contracts-and-generated-clients) for its exact guarantees and limits instead of treating it as a giant test command in disguise.

## Change a contract without abandoning installed clients

Start by asking what existing callers send and what they can decode. Mobile compatibility matters because the API can deploy while an older app remains installed.

Suppose a future posting-day response needs a new piece of prompt metadata. An additive rollout would normally look like this:

1. Add the response field as optional in the authored Zod schema.
2. Teach the route or service to supply it when available.
3. Regenerate OpenAPI and both clients.
4. Update new web and mobile wrappers to use a fallback when the field is absent.
5. Keep the server able to answer requests from clients that do not know the field.
6. Test the old response without the field and the new response with it.

An optional addition often lets Dayli's generated decoders ignore an unknown response key, while the new client can tolerate an older server that omits it. "Optional" is not a blanket compatibility stamp. A strict decoder, a new enum value, changed interpretation, or a screen that assumes the value exists can still break. Check the generated code and the actual wrappers.

Removing or renaming a field, making an optional request field required, changing a method or path, narrowing accepted values, or reusing a status code with a different body is breaking for at least one caller. Use a staged change instead: accept old and new input first, update clients, allow time for installed mobile versions, then remove the old form only when the supported-client policy permits it.

## A practical change workflow

For a request, response, method, path, status, or operation ID change:

1. Find the action contract and route under `apps/api/src/features/`. Check shared schemas under `packages/contracts/src/` before creating another date, ID, error, or pagination shape.
2. Decide how the current web app, current mobile app, and older installed mobile clients behave during rollout.
3. Update the authored schema, route declaration, handler mapping, and focused route tests. Update service or database code only when the behavior also changes there.
4. Check generated paths, then run `pnpm generate:clients`.
5. Review `packages/contracts/openapi.json` and both generated packages. Do not hand-edit their result.
6. Update wrappers and app behavior tests under `apps/web` and `apps/mobile`.
7. Run `pnpm generate:clients:check`, then the focused API and app checks described in [Testing](./testing).
8. Commit source, generated OpenAPI, both generated clients, wrappers, and focused tests together.

If only a database column changes, clients do not need regeneration unless the public HTTP agreement changes. If only an internal service type changes, the same rule applies. Generate clients because the API contract moved, not because a nearby TypeScript interface happened to move.

Before review, inspect the complete diff. No generated file should contain a credential, token, private response sample, or environment URL. Contract examples should use obvious specimen values such as `user-1`, `prompt-1`, and `.example.test` hosts.

A good contract change leaves one story in the pull request: authored source explains the agreement, generated files show its effect in both languages, wrappers adapt it to each app, and focused tests prove the wire details most likely to go wrong.

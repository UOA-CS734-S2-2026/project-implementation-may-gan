# API conventions

Dayli application routes use `/api/v1`. Breaking contract changes require a new major path; additive optional fields remain in v1. Better Auth keeps its library-owned `/api/auth/*` path. Infrastructure and documentation routes are not application resources.

## Resources and methods

Use plural lowercase nouns, nested resources only where ownership is clear, and standard HTTP methods. Create operations return `201`, reads and updates return `200`, successful deletion without a body returns `204`, and accepted background work returns `202`.

Use `PATCH` for partial updates. Use subordinate resources for actions that do not map cleanly to CRUD, such as `POST /api/v1/socket-tickets`.

## JSON and identifiers

JSON properties use `camelCase`. Public identifiers are opaque strings. Instants are RFC 3339 UTC strings; an Auckland calendar date is `YYYY-MM-DD`. Clients must not infer ordering or creation time from identifiers.

Single-resource responses return the resource. Paginated collections use:

```json
{
  "items": [],
  "nextCursor": null,
  "hasMore": false
}
```

Cursors are opaque. The default page size is 20 and the maximum is 100. Database queries need deterministic ordering with a stable tie-breaker.

## Errors

Application errors use one envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request contains invalid values.",
    "requestId": "req_01K4Y6P8K2",
    "details": {}
  }
}
```

Clients branch on `code`, never `message`. Messages and details must not reveal SQL, stack traces, credentials, provider responses, or private records. Use `404` instead of `403` where acknowledging a resource would leak its existence.

Common statuses are `400` for malformed requests, `401` for missing or invalid authentication, `403` for denied access, `404` for absent or concealed resources, `409` for state or idempotency conflicts, `422` for field validation, `429` for rate limits, `500` for unexpected failures, and `503` for temporary service failures.

## Authentication and retries

Web clients use secure cookies. Native clients use Better Auth bearer sessions stored in protected platform storage. Both resolve to the same server-side session. Never place reusable session credentials in URLs.

Retriable commands use `Idempotency-Key`. An identical retry returns the original outcome; reuse with a different request conflicts. Database constraints continue to enforce domain uniqueness independently.

## OpenAPI

`GET /api/v1/openapi.json` serves OpenAPI 3.1, and `GET /docs` renders it as an interactive Scalar reference. Every route declares a stable `operationId`, tag, summary, parameters, request body, successful responses, expected errors, authentication, and examples where useful. Route-adjacent Zod schemas are the source for runtime validation and client generation.

Private responses start with `Cache-Control: no-store`. Public-link caching must not be introduced until revocation behavior is tested.

## Feature structure and dependencies

Organise API code as operation-based vertical slices:

```text
apps/api/src/features/{domain}/{operation}/
├── contract.ts
├── route.ts
├── service.ts
└── route.test.ts
```

Only create files an operation needs. Contracts define transport schemas, routes handle Hono validation and responses, and services contain transport-independent orchestration. Shared business policies, public contract primitives, and database implementations may move into `packages/domain`, `packages/contracts`, and `packages/db` when they have multiple consumers.

Dependencies flow from routes to services and from services to repository or provider interfaces. Services must not import Hono, Cloudflare runtime modules, HTTP routes, or concrete database implementations. Contracts must not import routes, handlers, services, or database code. A route must not import or call another internal route; operations share a service or policy instead. Domain-level composition modules are responsible for registering routes.

ESLint enforces these boundaries for conventionally named `route.ts`, `service.ts`, and `contract.ts` files. Keeping those names consistent is therefore part of the architecture contract.

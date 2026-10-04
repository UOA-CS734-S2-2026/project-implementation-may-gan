---
title: Tech stack
description: What we use to build Dayli, and what each tool does.
---

Here is the toolkit behind Dayli. The web and mobile apps use different languages, but they share a backend and an API contract. No need to implement the posting rules twice!

If you want to see how these pieces connect, start with the [architecture overview](/docs/systems/architecture-overview).

## Applications

| Part | What we use | What it does |
| --- | --- | --- |
| Web | Next.js, React, TypeScript, Tailwind CSS | Builds the browser interface, routes, and forms. TanStack Query manages server state in features such as messaging. |
| Mobile | Flutter, Dart, GoRouter | Builds the mobile interface and navigation. Platform plugins handle things such as protected token storage, image picking, and compression. |
| API | Hono, TypeScript, Cloudflare Workers | Handles shared backend requests and business rules. |
| Authentication | Better Auth | Manages accounts and sessions. Web uses cookies, while mobile sends bearer tokens. |

The web project also has a vinext beta path for Cloudflare Worker builds. Its Next.js development and build commands remain available. This is a deployment choice for the web app, not a replacement for the shared Hono API.

## Data and delivery

| Part | What we use | What it does |
| --- | --- | --- |
| Database | PostgreSQL, Neon | Stores the application data. Local development uses PostgreSQL in Docker instead of the deployed Neon database. |
| Database access | Drizzle, Hyperdrive | Drizzle defines schemas and queries. Hyperdrive pools Worker database connections. |
| Media | Cloudflare R2 | Stores private images and videos, transferred using signed URLs. |
| Realtime | Cloudflare Durable Objects, WebSockets | Sends change notifications through per-user connections. REST still supplies the authorized message data. |
| Background work | PostgreSQL outbox records, Worker scheduled handlers | Tracks delivery work and retries it, alongside scheduled cleanup tasks. |
| Mobile push | Firebase Cloud Messaging, APNs | Provides the mobile notification path. Provider credentials and device verification are separate requirements. |

A dependency in a project does not mean its service is configured everywhere. Production is not deployed, and some integrations still need release checks. See [Environments](/docs/development/environments) before pointing anything at a remote service.

## Keeping the clients in agreement

Hono routes use Zod schemas to describe and validate the API. We generate `packages/contracts/openapi.json` from those routes, then generate a TypeScript fetch client and a Dart HTTP client.

Fumadocs OpenAPI uses that same document for the [API reference](/docs/api-reference). The separate [Scalar explorer](/docs/api-reference/playground) lets you inspect and try requests. One contract, several ways to use it.

## Development and documentation

The repository uses pnpm workspaces for the JavaScript and TypeScript projects, with Flutter's own tooling for mobile. Wrangler runs and deploys the API Worker. Database migrations have their own commands and database role.

This documentation site uses Next.js, Fumadocs, Markdown and MDX. Mermaid draws diagrams directly from code blocks, so we can update a diagram in the same change as its explanation.

Ready to run it? Head to [Local setup](/docs/development/local-setup). For testing commands and coverage, see [Testing](/docs/development/testing).

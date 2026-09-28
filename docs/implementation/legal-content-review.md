# Legal content review checklist

Status: internal review only. The bundled and web documents are `draft-1`, have no effective date, and must not be published as approved policies.

## Publication guard

Run both commands before a production release:

```bash
pnpm legal:check
pnpm legal:publish:check
```

`legal:publish:check` fails while either document is a draft or has no effective date. Set both documents to `approved` only after every item below is confirmed and the operator approves the final wording. The app pages show a draft notice until then.

## Claim evidence

| Claim area | Checked source | Owner confirmation required |
| --- | --- | --- |
| Account, session, provider, verification and rate-limit data | `packages/db/src/schema/index.ts`, `packages/db/src/schema/users.ts`, `apps/api/src/features/auth/better-auth.ts` | Fields populated in production, session duration, Google and email configuration |
| Browser and mobile local storage | `apps/web/lib/auth/client.ts`, `apps/web/lib/theme/provider.tsx`, `apps/mobile/lib/auth/native_session.dart`, `apps/mobile/lib/auth/session_controller.dart`, `apps/mobile/lib/drafts/draft_store.dart` | Browser cookie configuration, mobile backup and temporary-file behavior |
| Posts, revisions, notes, relationships and blocks | `packages/db/src/schema/index.ts`, `docs/dayli/product-decisions.md`, `docs/dayli/security.md` | Released audience and revision behavior |
| Media | `docs/dayli/media-reservations.md`, `apps/api/src/features/media/` | Only disclose after complete upload, validation, attachment, download, and cleanup behavior is released |
| Messaging and push | `docs/implementation/messaging-implementation-handoff.md` | Release confirmation, retention, push content, providers, and block behavior |
| Hosting, providers and transfers | `docs/implementation/implementation-reference.md`, `docs/dayli/product-decisions.md` | Production providers, regions, operator access, logs, analytics, advertising, external processing |
| Retention, deletion and backups | `docs/dayli/product-decisions.md`, `docs/dayli/security.md` | Verified deletion route, cleanup, backup expiry, request procedure, restoration exercise |

## Owner decisions required

- Legal operator identity, privacy and support contact, and business address if required.
- Countries served, age eligibility, governing law, disputes, consumer-rights treatment, and legal bases.
- Course or pilot status, research or teaching use, and the released feature set.
- Production data processors, hosting regions, analytics, advertising, sale or sharing position, and access controls.
- Retention by data category, verified deletion and backup behavior, and access, correction, complaint, and deletion request handling.
- Terms acceptance requirements, including whether the server must record a version and timestamp.
- Final reviewer, approver, version, effective date, and release owner.

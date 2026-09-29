# Final local production Chromium QA, PR #149 commit `6bd2cce`

## Environment

- Built successfully with `NEXT_PUBLIC_API_BASE_URL=https://mock.dayli.test pnpm build` in `apps/web`.
- Ran the production server through `pnpm exec next start -p 3002`, not Next development mode. Screenshots have no dev badge.
- Used local Chromium plus Playwright request interception. Better Auth and social and messaging responses were in-memory fixtures only. No live credentials, backend writes, or deployment were used. QA was run before committing the same tested source as `6bd2cce`.
- Reference baseline: `/tmp/dayli-wdcc-reference` at the requested `3f961fe`. Fixture names only identify test controls. No profile stats were created or compared.

## Results

The provider regression remains fixed. No `QueryClient` crash or browser console errors occurred. The Strict Mode friends lifecycle fix now renders populated incoming and sent requests, friend cards, search results, and their action controls.

The mobile safe-area and opaque header backplate prevent the floating menu control from covering route content in the initial and scrolled friends, conversation, and draft captures.

## Screenshot evidence

All 28 fresh PNGs are in `/tmp/dayli-wdcc-qa-final/`.

Key desktop 1440x900 captures:

- `desktop-friends.png`: populated requests and circle
- `desktop-friends-search-results.png`: populated local search results
- `desktop-friends-add-action.png`: actual mocked add-friend control interaction
- `desktop-friends-accept-action.png`: actual mocked request-accept control interaction
- `desktop-search-results.png`
- `desktop-profile-alice-none.png`, `desktop-profile-alice-add-interaction.png`, `desktop-profile-alice-outgoing_pending.png`, `desktop-profile-alice-incoming_pending.png`, `desktop-profile-alice-friends.png`
- `desktop-inbox.png`, `desktop-requests.png`
- `desktop-new-picker.png`, `desktop-new-alice-draft-filled.png`, `desktop-conversation.png`

Key mobile 390x844 captures:

- `mobile-friends.png`, `mobile-friends-scrolled.png`
- `mobile-conversation.png`, `mobile-conversation-scrolled.png`
- `mobile-draft.png`, `mobile-draft-scrolled.png`
- `mobile-menu-open.png`

## Interactions actually performed

- User search typing and rendered search results
- Profile add-friend click and post-mutation mocked state
- Friends page search, add-friend action, and accept-request action
- Inbox requests tab selection
- New-message draft text entry
- Existing conversation load and local mocked read receipt
- Mobile scrolling on friends, conversation, and draft screens
- Mobile menu open

## Console and network

- Browser console errors and warnings: **none**. See `console-network.txt`.
- The request-failure list contains only `net::ERR_ABORTED` local `?_rsc=` navigation-prefetch requests. They are browser-cancelled Next prefetches when the harness moves to the next route or closes a context, not API failures. No mocked auth, social, or messaging request failed.
- Full test transcript: `run.log`. Build: `build.log`. Production server: `server.log`.

## New P1 or P2 findings

None found in this rerun. The mobile content-overlap and local friends loading findings from the previous QA run are resolved in this production capture.

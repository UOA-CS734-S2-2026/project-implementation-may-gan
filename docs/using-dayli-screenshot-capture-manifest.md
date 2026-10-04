# Dayli documentation screenshot capture manifest

Captured on 2026-10-04 using a disposable local PostgreSQL fixture, local HTTPS API and web services, and a debug Flutter build on the Android API 35 emulator. The fixture used only the synthetic `alex_docs` account and `alex.docs@example.com` address. Web captures used a 1440 by 1000 viewport. Native captures were cropped to remove Android system chrome.

| Checklist ID | File | Status |
| --- | --- | --- |
| UD-GS-01 | `getting-started-web-sign-up.webp` | Captured |
| UD-GS-02 | `getting-started-mobile-navigation.webp` | Captured |
| UD-CDP-01 | `create-web-empty-composer.webp` | Captured |
| UD-CDP-02 | None | Not captured. The isolated local media service was not configured. |
| UD-FF-01 | `friends-mobile-tabs-and-discovery.webp` | Captured |
| UD-FF-02 | None | Not captured. No test friend posts were seeded. |
| UD-PS-01 | `privacy-mobile-audience-unselected.webp` | Captured |
| UD-PS-02 | `privacy-web-profile-visibility.webp` | Captured |
| UD-HT-01 | None | Not captured. The local reset flow did not reach the confirmation state because email delivery was not configured. |
| UD-HT-02 | None | Not captured. The isolated fixture was not configured to return the closed-window server response. |

## Additional documentation captures

| File | Use | Status |
| --- | --- | --- |
| `product/web-sign-in.webp` | Accounts and authentication | Captured with blank fields on the disposable local web app. |
| `product/web-profile-history.webp` | Reflection and history | Captured with Alex Lee's synthetic Solo reflection. |
| `product/web-messaging-sendable-conversation.webp` | Direct messages | Captured on the isolated local web fixture with synthetic Alex Lee and Sam Test accounts. |

The existing composer, friends, and mobile navigation images are reused once each in the daily-post, friends-and-feed, and mobile-development system documentation. No additional screenshots were added to architecture, backend, operations, media, or local-setup pages because their diagrams and commands describe behavior more directly.

The earlier local web messaging attempt did not produce a sendable synthetic conversation. A later isolated worktree run did, and the retained `product/web-messaging-sendable-conversation.webp` uses synthetic Alex Lee and Sam Test accounts. Authenticated post editing remains unavailable without extra fixture work.

## Follow-up attempt, 2026-10-04

A new isolated local PostgreSQL fixture, migrations, local media store, and HTTPS API started successfully. The local web process could not start because another local Next development process already held the shared `apps/web/.next` development lock. That fixture was removed. A subsequent detached worktree avoided the shared build directory and produced the additional web captures listed above. No checklist status has been promoted based on source code alone.

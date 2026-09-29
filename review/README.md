# PR #149 visual review

Screenshots for the restyled Friends and Messages screens in [PR #149](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/149). This is a review-only branch. The PNGs do not belong in the application PR.

The Friends, Message Requests and collision-safe profile images show feature HEAD `05f9781` in production-mode Chromium at 1440x900 and 390x844. The unchanged Messages list, Friend Requests and new-conversation images came from earlier builds. Auth and API responses were mocked. The [latest QA result](social-review-qa-report.txt) confirms the removed Friends badge, separate actions menu, request buttons aligned below the preview, a `/u/messages` profile, and no console errors or horizontal overflow. The [Messages width check](web-qa-report.md) covers the earlier list capture.

Flutter unit and widget tests passed after these changes. A fresh native image with readable text was not available, so older Flutter widget screenshots have been removed. Emulator, phone and authenticated staging checks remain outstanding.

## Web desktop

| Friends | Messages |
| --- | --- |
| ![Friends desktop](screenshots/web/desktop-friends.png) | ![Messages desktop](screenshots/web/desktop-messages.png) |
| ![Friend actions menu desktop](screenshots/web/desktop-friends-menu-open.png) | ![Message requests desktop](screenshots/web/desktop-message-requests.png) |
| ![Friend requests desktop](screenshots/web/desktop-friend-requests.png) | |

## Web mobile

| Friends | Messages |
| --- | --- |
| ![Friends mobile](screenshots/web/mobile-friends.png) | ![Messages mobile](screenshots/web/mobile-messages.png) |
| ![Friend actions menu mobile](screenshots/web/mobile-friends-menu-open.png) | ![Message requests mobile](screenshots/web/mobile-message-requests.png) |
| ![Friend requests mobile](screenshots/web/mobile-friend-requests.png) | |

The [new-conversation picker](screenshots/web/desktop-new-picker.png), [new-pair draft](screenshots/web/desktop-new-pair-draft.png), and collision-safe profile at [desktop](screenshots/web/desktop-claimed-messages-profile.png) and [mobile](screenshots/web/mobile-claimed-messages-profile.png) are also included.

# PR #149 visual review

Screenshots for the restyled Friends and Messages screens in [PR #149](https://github.com/UOA-CS734-S2-2026/project-implementation-may-gan/pull/149). This is a review-only branch. The PNGs do not belong in the application PR.

The web images came from a production-mode Chromium build at 1440x900 and 390x844. Auth and API responses were mocked. The capture followed the Messages width fix. Subsequent changes through social HEAD `6aac3d7` did not alter the web presentation. Browser checks found no console errors or horizontal overflow. Dates use the browser's local time zone. See the [focused web QA report](web-qa-report.md) for the capture results.

The native images came from 390x844 Flutter widget captures after the native list-action fixes. They use fake test data and a substitute font, and show Flutter's debug banner. They are not emulator, phone, authenticated staging, or physical-device proof.

## Web desktop

| Friends | Messages |
| --- | --- |
| ![Friends desktop](screenshots/web/desktop-friends.png) | ![Messages desktop](screenshots/web/desktop-messages.png) |
| ![Friend requests desktop](screenshots/web/desktop-friend-requests.png) | ![Message requests desktop](screenshots/web/desktop-message-requests.png) |

## Web mobile

| Friends | Messages |
| --- | --- |
| ![Friends mobile](screenshots/web/mobile-friends.png) | ![Messages mobile](screenshots/web/mobile-messages.png) |
| ![Friend requests mobile](screenshots/web/mobile-friend-requests.png) | ![Message requests mobile](screenshots/web/mobile-message-requests.png) |

The [new-conversation picker](screenshots/web/desktop-new-picker.png) and [new-pair draft](screenshots/web/desktop-new-pair-draft.png) are also included.

## Flutter widget captures

| Friends | Messages |
| --- | --- |
| ![Flutter friends](screenshots/native/friends.png) | ![Flutter messages](screenshots/native/messages.png) |
| ![Flutter friend requests](screenshots/native/friend-requests.png) | ![Flutter message requests](screenshots/native/message-requests.png) |

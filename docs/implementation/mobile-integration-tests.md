# Mobile integration tests

`apps/mobile/integration_test/auth_navigation_smoke_test.dart` is a native UI smoke test. It starts `DayliApp` with `TestHarness` fakes, enters email and password fields, and checks navigation to the home screen. It does not send a request to Better Auth or prove a real API login.

`apps/mobile/integration_test/legal_navigation_integration_test.dart` does not use `TestHarness`. It starts the real router, session controller, protected stores, generated clients, and bundled legal assets with a cleared session and an unused loopback API origin. It checks offline draft reading and form-state preservation without changing machine networking. It is not evidence of a real account, Better Auth, or lifecycle flow.

Run the fake navigation smoke test or offline legal journey on a booted Android emulator or iOS simulator:

```bash
cd apps/mobile
flutter test integration_test/auth_navigation_smoke_test.dart -d <device-id>
flutter test integration_test/legal_navigation_integration_test.dart -d <device-id>
```

## Disposable Android Better Auth journey

`scripts/test-mobile-legal-e2e.sh` starts a fresh local PostgreSQL Compose project and local Better Auth Worker, then removes both. It uses the existing developer-installed mkcert root and `adb reverse` only for the randomly chosen Worker port. It does not install a CA, create a public endpoint, use staging or production, or clear general emulator app data. The generated account exists only in the destroyed database.

The journey in `integration_test/legal_backend_integration_test.dart` uses real `AppServices`, router, protected storage, generated clients, and Better Auth. It covers email sign-up, persisted-session restart, Settings to Privacy and Terms with back navigation, bearer sign-out, public legal reading, preserved unsubmitted sign-in fields, and email sign-in. Realtime transport is deliberately outside this legal journey because it needs its own WebSocket fixture. No session controller or API authorization is faked.

Run it on the existing Android emulator after the documented local HTTPS setup, with `mkcert`, Docker, and Android platform-tools available:

```bash
scripts/test-mobile-legal-e2e.sh emulator-5554
```

The runner requires the existing local `localhost` certificate and mkcert root. It passes that root only to the debug test process through `DAYLI_DEV_CA_PEM_B64`, which is the existing Android debug trust mechanism. It removes only the reverse mapping it created.

## Remaining isolated API journey scope

The live legal journey proves a real local email/password session and protected bearer handling. It does not prove Google sign-in, realtime, deletion, export, Terms acceptance, provider delivery, or lifecycle behavior. Those need their own isolated fixtures and cannot use production accounts, a production database, or production credentials.

The regular PR checks keep running generated-client checks, analysis, unit and widget tests, and a debug Android build. The emulator integration run belongs on manual or main-branch CI until the repository owner approves hosted Actions spending. On 2026-09-30, the local check found Command Line Tools as the active developer directory, no full Xcode, and no `simctl` utility. Install full Xcode with an iOS Simulator runtime, boot a simulator, and follow the documented mkcert trust steps before adding iOS evidence. Android evidence does not substitute for iOS.

Messaging coverage remains with the messaging feature. That work must add pending and retry ID preservation, inbox and thread navigation, live delivery, reconnect recovery after edits or unsends, background behavior, account isolation, and notification tap routing. Physical iOS and Android devices remain required evidence for credentials and FCM or APNs delivery, permissions, token rotation, and cold or warm notification taps.

# Mobile integration tests

`apps/mobile/integration_test/auth_navigation_smoke_test.dart` is a native UI smoke test. It starts `DayliApp` with `TestHarness` fakes, enters email and password fields, and checks navigation to the home screen. It does not send a request to Better Auth or prove a real API login.

`apps/mobile/integration_test/legal_navigation_integration_test.dart` does not use `TestHarness`. It starts the real router, session controller, protected stores, generated clients, and bundled legal assets with a cleared session and an unused loopback API origin. It checks offline draft reading and form-state preservation without changing machine networking. It is not evidence of a real account, Better Auth, or lifecycle flow.

Run the smoke test on a booted Android emulator or iOS simulator:

```bash
cd apps/mobile
flutter test integration_test/auth_navigation_smoke_test.dart -d <device-id>
flutter test integration_test/legal_navigation_integration_test.dart -d <device-id>
```

## Real isolated API journey

A real email-login journey requires a disposable Dayli API Worker with Better Auth email sign-in enabled, a disposable PostgreSQL database, and an emulator-reachable HTTPS origin in that Worker's trusted origins. It must never use production accounts, a production database, or production credentials.

The repository does not yet provide a disposable Worker deployment or test credentials. Those are the external gate. The owner must supply a reviewed isolated API URL and a synthetic test account, then run the app against that URL with the existing runtime configuration:

```bash
cd apps/mobile
flutter test integration_test/<real-api-test>.dart -d <device-id> \
  --dart-define=DAYLI_API_BASE_URL=https://isolated-api.example.test
```

Add `<real-api-test>.dart` only with the isolated API fixture. It should create or reset the synthetic account through approved test setup, sign in through the real Better Auth email endpoint, verify the bearer session on a protected endpoint, and clean up its data. This work needs owner approval for the disposable Worker configuration and credentials. The fake smoke test is not a substitute.

The regular PR checks keep running generated-client checks, analysis, unit and widget tests, and a debug Android build. The emulator integration run belongs on manual or main-branch CI until the repository owner approves hosted Actions spending. An iOS simulator path needs reviewed native configuration before it is added.

Messaging coverage remains with the messaging feature. That work must add pending and retry ID preservation, inbox and thread navigation, live delivery, reconnect recovery after edits or unsends, background behavior, account isolation, and notification tap routing. Physical iOS and Android devices remain required evidence for credentials and FCM or APNs delivery, permissions, token rotation, and cold or warm notification taps.

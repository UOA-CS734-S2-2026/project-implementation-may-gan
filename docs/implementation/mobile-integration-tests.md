# Mobile integration tests

`apps/mobile/integration_test/auth_navigation_test.dart` starts the app with the same synthetic service harness used by widget tests. It covers the implemented email sign-in path and confirms that navigation reaches the home screen. It does not call production services.

Run it on a booted Android emulator or iOS simulator:

```bash
cd apps/mobile
flutter test integration_test/auth_navigation_test.dart -d <device-id>
```

The regular PR checks keep running generated-client checks, analysis, unit and widget tests, and a debug Android build. The emulator integration run belongs on manual or main-branch CI until the repository owner approves hosted Actions spending. An iOS simulator path needs reviewed native configuration before it is added.

Messaging coverage remains with the messaging feature. That work must add pending and retry ID preservation, inbox and thread navigation, live delivery, reconnect recovery after edits or unsends, background behavior, account isolation, and notification tap routing. Physical iOS and Android devices remain required evidence for credentials and FCM or APNs delivery, permissions, token rotation, and cold or warm notification taps.

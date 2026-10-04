# Mobile Biometric Unlock

Status: Device authentication (Face ID, Touch ID, device passcode) is implemented for the mobile application. This secures the app when it leaves the foreground and provides a fallback recovery mechanism.

## Decisions

- Use the `local_auth` Flutter package for device authentication capabilities.
  - Note that, while the intended use of this feature is for biometric unlock, native security implentations allow for the use of any standard device-level unlock method (e.g. iris scan, fingerprint, and so on).
  - iOS provides a native app lock as an OS feature using Face ID, which is independent of any app and is not impacted by this functionality. Both this feature and the OS app lock serve similar purposes, though setting this up through the iOS feature is limited to versions after iOS 18.
- Integrate with the app lifecycle to obscure content when inactive and lock the app when backgrounded.
- Fall back to an account sign-out if the user is locked out of device authentication.
- Delegate window security (`FLAG_SECURE` on Android) to native code via a custom `MethodChannel` to prevent background screenshots of locked content.

## Native Configuration

Platform-specific permissions and configurations are required to support biometrics:

### iOS
Face ID requires a usage description in `Info.plist`.
- Added `NSFaceIDUsageDescription`: "Use Face ID to quickly unlock Dayli."

### Android
Requires the biometric permission and a `FlutterFragmentActivity` instead of `FlutterActivity`.
- Added `<uses-permission android:name="android.permission.USE_BIOMETRIC"/>` to `AndroidManifest.xml`.
- Updated `MainActivity.kt` to inherit from `FlutterFragmentActivity` (required by `local_auth` for the biometric prompt).

## Responsibilities and Architecture

### BiometricService
The `BiometricService` (in `apps/mobile/lib/auth/biometric_service.dart`) acts as the state manager and coordinator for device authentication. It handles:
- Reading and persisting the user's biometric preference using `SharedPreferencesBiometricStore`.
- Managing the lock state (`_isLocked`) and privacy shield state (`_isObscured`).
- Invoking the `local_auth` plugin to trigger the system authentication prompt.
- Managing communication with native channels (e.g., `setSecure` on Android).

### App Lifecycle Integration
The lock mechanism splits lifecycle handling to manage both the system's own authentication prompts (which trigger the `inactive` state) and actual app backgrounding:
- **Obscure (`inactive`)**: Applies a privacy cover without triggering a prompt. This prevents sensitive data from appearing in the app switcher. It ignores state changes if an authentication prompt is already open.
- **Reveal (`resumed`)**: Removes the privacy cover. This action alone never unlocks the app.
- **Lock (`hidden` / `paused`)**: Explicitly locks the app. A pending authentication prompt that succeeds will unlock the app, but a cancelled one leaves it locked.

### Security and Privacy Shield
To prevent OS-level snapshots (app switcher previews) from exposing user data:
- **Android**: `BiometricService` uses a `MethodChannel` (`nz.ac.auckland.dayli/security`) to toggle `WindowManager.LayoutParams.FLAG_SECURE` on the `MainActivity`. This explicitly blocks screenshots and obscures the app in the recent apps list when the biometric lock is enabled.
- **Flutter UI**: A `PrivacyShield` widget (in `lock_screen.dart`) is rendered over the app content during the `inactive` state.

## Recovery Mechanism
If device authentication becomes unavailable (e.g., biometrics repeatedly fail or the device passcode is removed), the user is permanently locked out locally.

`BiometricService.recoverWithAccount()` provides an escape hatch:
1. It forces a complete account sign-out (`session.signOutToReauthenticate()`), revoking the active session.
2. Only if the sign-out succeeds, the biometric lock is disabled locally.
3. The user is returned to the login screen. Any local drafts are preserved on the device, but access to the account requires their Better Auth credentials.

---
title: Try the mobile app on staging
description: Build the Flutter app on an Android emulator or phone against the deployed staging API, with no local backend.
---

# Try the mobile app on staging

This is the shortest way to use the Flutter app. It talks to the deployed staging API, so it needs no Docker, local database, mkcert, or `adb reverse`. For a fully local stack, follow [Local setup](/docs/development/local-setup) instead.

Staging is the shared development environment. Its data can change while the team is working, so use a test account.

## What you need

- Flutter 3.47 or newer, which the locked dependencies require. CI uses 3.47.2.
- Android Studio with an Android emulator, or an Android phone with USB debugging on.
- JDK 17.

iOS is optional and needs a Mac with Xcode. The same command works with an iOS Simulator selected.

## Run the app

Start an emulator or connect a phone, then run:

```bash
cd apps/mobile
flutter pub get
flutter run --dart-define=DAYLI_API_BASE_URL=https://api.staging.dayli.agroupforcoders.com
```

Use the origin exactly as shown, with no trailing slash. The app refuses to start without `DAYLI_API_BASE_URL`.

On the welcome screen, choose **Create an account** and sign up with an email and password, or sign in with an account you already made on the [staging web app](https://staging.dayli.agroupforcoders.com). Accounts are shared between web and mobile.

To install a build instead of running it from Flutter, build a debug APK with the same define and drag it onto the emulator, or use `adb install`:

```bash
flutter build apk --debug --dart-define=DAYLI_API_BASE_URL=https://api.staging.dayli.agroupforcoders.com
adb install build/app/outputs/flutter-apk/app-debug.apk
```

## Google sign-in is optional

> Google sign-in on mobile is not available in a build made from this guide. Use email and password, which covers every feature. Google sign-in works on mobile only on team devices whose signing key is registered with Google, and on the [staging web app](https://staging.dayli.agroupforcoders.com).

Email and password covers every feature. **Continue with Google** is always shown, but without the staging web client ID it reports "Google sign-in isn't set up for this build yet." To enable it, also pass the client ID:

```bash
flutter run \
  --dart-define=DAYLI_API_BASE_URL=https://api.staging.dayli.agroupforcoders.com \
  --dart-define=DAYLI_GOOGLE_WEB_CLIENT_ID=<staging web client ID>
```

The client ID is a public identifier, not a secret. Google also checks the app's signing key, so Google sign-in works only on a machine whose debug SHA-1 is registered in the staging Google Cloud project for the package `nz.ac.auckland.dayli.dayli_mobile.staging`. Get that fingerprint with `./gradlew signingReport` in `apps/mobile/android`, and ask the team to add it and your Google account as a test user. Without that, use email and password.

## What to try

- Post today's dayli from the middle button, with a rating, an answer, photos, or a voice memo.
- Add a friend from **friends**, then like and comment on each other's posts after they release at Auckland midnight.
- Edit one of your posts from **my days** and open its earlier versions.
- Open your profile for the stats, day streak, and **Mood** chart.

Deleting a post is not available yet, because post Trash is switched off. See [Reflection and history](/docs/systems/reflection-and-history#deletion-and-trash-are-present-but-switched-off).

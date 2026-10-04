import 'dart:io';

import 'package:dayli_mobile/firebase_options.dart';
import 'package:dayli_mobile/notifications/firebase_push_source.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

int _fingerprint(String value) {
  var hash = 0x811c9dc5;
  for (final codeUnit in value.codeUnits) {
    hash ^= codeUnit;
    hash = (hash * 0x01000193) & 0xffffffff;
  }
  return hash;
}

void main() {
  group('staging Firebase options', () {
    test('Android metadata matches the registered debug app', () {
      final options = stagingFirebaseOptions(
        platform: TargetPlatform.android,
        debugMode: true,
      );

      expect(options.projectId, 'dayli-staging-331be');
      expect(options.appId, '1:707245570115:android:6bfd79541cc1f940ef3cf6');
      expect(options.messagingSenderId, '707245570115');
      expect(_fingerprint(options.apiKey), 968369606);
    });

    test('iOS metadata matches the registered app', () {
      final options = stagingFirebaseOptions(
        platform: TargetPlatform.iOS,
        debugMode: true,
      );

      expect(options.projectId, 'dayli-staging-331be');
      expect(options.appId, '1:707245570115:ios:aee0d647b9507315ef3cf6');
      expect(options.messagingSenderId, '707245570115');
      expect(options.iosBundleId, 'nz.ac.auckland.dayli.dayliMobile');
      expect(_fingerprint(options.apiKey), 2957062703);
    });

    test('release and profile modes fail closed', () {
      for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
        expect(
          () => stagingFirebaseOptions(platform: platform, debugMode: false),
          throwsStateError,
        );
      }
    });

    test('unregistered platforms are rejected', () {
      expect(
        () => stagingFirebaseOptions(
          platform: TargetPlatform.macOS,
          debugMode: true,
        ),
        throwsUnsupportedError,
      );
    });
  });

  group('push initialization', () {
    test('disabled flag does not initialize or register a handler', () async {
      var initialized = false;
      var registered = false;

      final result = await initializeFirebasePushIfConfigured(
        false,
        platform: TargetPlatform.android,
        debugMode: true,
        initializer: (_) async {
          initialized = true;
        },
        registerBackgroundHandler: (_) {
          registered = true;
        },
      );

      expect(result, isFalse);
      expect(initialized, isFalse);
      expect(registered, isFalse);
    });

    test('enabled debug flag initializes before registering', () async {
      FirebaseOptions? initializedWith;
      BackgroundMessageHandler? registeredHandler;

      final result = await initializeFirebasePushIfConfigured(
        true,
        platform: TargetPlatform.android,
        debugMode: true,
        initializer: (options) async {
          initializedWith = options;
        },
        registerBackgroundHandler: (handler) {
          registeredHandler = handler;
        },
      );

      expect(result, isTrue);
      expect(initializedWith, isNotNull);
      expect(registeredHandler, same(firebaseMessagingBackgroundHandler));
    });

    test(
      'foreground and background initialization select one project',
      () async {
        final initializedWith = <FirebaseOptions>[];

        for (var invocation = 0; invocation < 2; invocation++) {
          await initializeStagingFirebaseApp(
            platform: TargetPlatform.iOS,
            debugMode: true,
            initializer: (options) async {
              initializedWith.add(options);
            },
          );
        }

        expect(initializedWith, hasLength(2));
        expect(initializedWith[0], same(initializedWith[1]));
        expect(initializedWith[0].projectId, 'dayli-staging-331be');
      },
    );
  });

  test('native build configuration stays scoped to debug', () {
    final androidGradle = File(
      'android/app/build.gradle.kts',
    ).readAsStringSync();
    expect(androidGradle, contains('applicationIdSuffix = ".staging"'));
    expect(androidGradle, isNot(contains('com.google.gms.google-services')));
    final androidManifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();
    expect(androidManifest, contains('firebase_messaging_auto_init_enabled'));
    expect(
      androidManifest,
      contains('android:name="android.permission.POST_NOTIFICATIONS"'),
    );

    final project = File(
      'ios/Runner.xcodeproj/project.pbxproj',
    ).readAsStringSync();
    expect(project, contains('INFOPLIST_FILE = "Runner/Info-Debug.plist"'));
    expect(
      project,
      contains('CODE_SIGN_ENTITLEMENTS = "Runner/Runner-Debug.entitlements"'),
    );
    expect(
      RegExp('INFOPLIST_FILE = Runner/Info.plist;').allMatches(project),
      hasLength(2),
    );

    final debugInfo = File('ios/Runner/Info-Debug.plist').readAsStringSync();
    final releaseInfo = File('ios/Runner/Info.plist').readAsStringSync();
    const sharedNativeSettings = [
      '<key>NSPhotoLibraryUsageDescription</key>',
      '<key>NSCameraUsageDescription</key>',
      '<key>NSMicrophoneUsageDescription</key>',
      '<string>\$(GOOGLE_REVERSED_CLIENT_ID)</string>',
      '<string>\$(PRODUCT_BUNDLE_IDENTIFIER).composer</string>',
      '<string>dayli</string>',
    ];
    for (final setting in sharedNativeSettings) {
      expect(releaseInfo, contains(setting));
      expect(debugInfo, contains(setting));
    }
    expect(
      RegExp(r'<key>CFBundleURLSchemes</key>').allMatches(releaseInfo),
      hasLength(2),
    );
    expect(
      RegExp(r'<key>CFBundleURLSchemes</key>').allMatches(debugInfo),
      hasLength(2),
    );
    expect(debugInfo, contains('<string>remote-notification</string>'));
    expect(releaseInfo, isNot(contains('remote-notification')));
    expect(debugInfo, isNot(contains('FirebaseAppDelegateProxyEnabled')));
    expect(debugInfo, contains('<key>FirebaseMessagingAutoInitEnabled</key>'));
    expect(
      releaseInfo,
      contains('<key>FirebaseMessagingAutoInitEnabled</key>'),
    );

    final entitlements = File(
      'ios/Runner/Runner-Debug.entitlements',
    ).readAsStringSync();
    expect(entitlements, contains('<key>aps-environment</key>'));
    expect(entitlements, contains('<string>development</string>'));
  });
}

import 'package:dayli_mobile/app/config.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Firebase build support', () {
    test('an iOS browser does not enable native push by default', () {
      expect(
        firebasePushConfiguredForBuild(
          platform: TargetPlatform.iOS,
          debugMode: true,
          web: true,
        ),
        isFalse,
      );
    });

    test('iOS debug supports push without an extra build flag', () {
      expect(
        firebasePushConfiguredForBuild(
          platform: TargetPlatform.iOS,
          debugMode: true,
        ),
        isTrue,
      );
    });

    test('release, profile and other platforms retain explicit opt-in', () {
      for (final platform in TargetPlatform.values) {
        expect(
          firebasePushConfiguredForBuild(platform: platform, debugMode: false),
          isFalse,
        );
        if (platform != TargetPlatform.iOS) {
          expect(
            firebasePushConfiguredForBuild(platform: platform, debugMode: true),
            isFalse,
          );
        }
      }
    });

    test('explicit build flags override the iOS debug default', () {
      for (final configured in [false, true]) {
        expect(
          firebasePushConfiguredForBuild(
            platform: TargetPlatform.iOS,
            debugMode: true,
            configured: configured,
          ),
          configured,
        );
      }
    });
  });

  test('native export stays off without an explicit staging build', () {
    expect(
      const AppConfig(
        apiBaseUrl: 'https://api.staging.dayli.agroupforcoders.com',
      ).accountExportEnabled,
      isFalse,
    );
  });

  test('only the exact staging API origin can open a tester build', () {
    expect(
      const AppConfig(
        apiBaseUrl: 'https://api.staging.dayli.agroupforcoders.com',
        stagingExportApproved: true,
      ).accountExportEnabled,
      isTrue,
    );
    expect(
      const AppConfig(
        apiBaseUrl: 'https://api.dayli.agroupforcoders.com',
        stagingExportApproved: true,
      ).accountExportEnabled,
      isFalse,
    );
  });
}

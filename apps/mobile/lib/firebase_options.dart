import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Firebase client metadata for the registered staging debug apps.
///
/// Firebase client options are public application identifiers, not provider
/// credentials. Release and profile builds deliberately have no configuration.
FirebaseOptions stagingFirebaseOptions({
  TargetPlatform? platform,
  bool debugMode = kDebugMode,
}) {
  if (!debugMode) {
    throw StateError(
      'Staging Firebase is available only in Android and iOS debug builds.',
    );
  }

  return switch (platform ?? defaultTargetPlatform) {
    TargetPlatform.android => _androidStaging,
    TargetPlatform.iOS => _iosStaging,
    _ => throw UnsupportedError(
      'Staging Firebase is configured only for Android and iOS.',
    ),
  };
}

const _androidStaging = FirebaseOptions(
  apiKey: 'AIzaSyDfEhObeNbSgeIzpjofTzNZti1dbu3Bzus',
  appId: '1:707245570115:android:6bfd79541cc1f940ef3cf6',
  messagingSenderId: '707245570115',
  projectId: 'dayli-staging-331be',
  storageBucket: 'dayli-staging-331be.firebasestorage.app',
);

const _iosStaging = FirebaseOptions(
  apiKey: 'AIzaSyCVzL-LCBFhCiqyI0LG2Hlwr0iSpaAvXfw',
  appId: '1:707245570115:ios:aee0d647b9507315ef3cf6',
  messagingSenderId: '707245570115',
  projectId: 'dayli-staging-331be',
  storageBucket: 'dayli-staging-331be.firebasestorage.app',
  iosBundleId: 'nz.ac.auckland.dayli.dayliMobile',
);

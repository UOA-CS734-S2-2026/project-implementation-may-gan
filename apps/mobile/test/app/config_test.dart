import 'package:dayli_mobile/app/config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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

import 'dart:io';

import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/settings/account_export_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../test/support/fakes.dart';

const _requestId = 'c09fd9f4-f274-47c3-8b8c-55fa54d9c335';
const _syntheticEmptyZip = <int>[
  80,
  75,
  5,
  6,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
];

class _SyntheticExports implements AccountExportClient {
  File? destination;

  @override
  Future<AccountExportStatus> status() async => AccountExportStatus(
    requestId: _requestId,
    status: 'ready',
    requestedAt: DateTime.utc(2026, 10, 1),
    readyAt: DateTime.utc(2026, 10, 1),
    expiresAt: DateTime.utc(2090, 10, 2),
  );

  @override
  Future<void> request() async => fail('No export request is permitted');

  @override
  Future<File> download({
    required String requestId,
    required File destination,
  }) async {
    expect(requestId, _requestId);
    this.destination = destination;
    await destination.writeAsBytes(_syntheticEmptyZip);
    return destination;
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('synthetic ZIP reaches the emulator share flow and is removed', (
    tester,
  ) async {
    final exports = _SyntheticExports();
    final harness = TestHarness(accountExports: exports);
    await harness.session.signIn(
      email: 'synthetic-export@example.test',
      password: 'correct-password',
    );
    await tester.pumpWidget(
      DayliApp(
        services: harness.services,
        useGoogleFonts: false,
        initialLocation: '/account/export',
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Download and share ZIP'), findsOneWidget);
    // The real SharePlus Android intent runs here. Only the export client
    // is synthetic; no account API is enabled.
    await tester.tap(find.text('Download and share ZIP'));
    await tester.pumpAndSettle();
    expect(exports.destination, isNotNull);
    // The host test driver checks the synthetic file while the Android
    // chooser is visible, then dismisses it. The file must disappear after.
    for (var i = 0; i < 100 && await exports.destination!.exists(); i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await tester.pump();
    }
    expect(await exports.destination!.exists(), isFalse);
  });
}

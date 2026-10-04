import 'dart:io';

import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/settings/account_export_client.dart';
import 'package:dayli_mobile/settings/account_export_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

const requestId = 'c09fd9f4-f274-47c3-8b8c-55fa54d9c335';

class FakeExports implements AccountExportClient {
  AccountExportStatus current = const AccountExportStatus(
    requestId: null,
    status: 'none',
    requestedAt: null,
    readyAt: null,
    expiresAt: null,
  );
  int reads = 0;
  int requests = 0;
  int downloads = 0;

  @override
  Future<AccountExportStatus> status() async {
    reads++;
    return current;
  }

  @override
  Future<void> request() async {
    requests++;
    current = const AccountExportStatus(
      requestId: requestId,
      status: 'building',
      requestedAt: null,
      readyAt: null,
      expiresAt: null,
    );
  }

  @override
  Future<File> download({
    required String requestId,
    required File destination,
  }) async {
    downloads++;
    expect(requestId, equals('c09fd9f4-f274-47c3-8b8c-55fa54d9c335'));
    await destination.writeAsBytes([80, 75, 3, 4]);
    return destination;
  }
}

void main() {
  testWidgets('the direct account route remains inert without activation', (
    tester,
  ) async {
    final harness = TestHarness();
    await harness.session.signIn(
      email: 'jos@example.test',
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
    expect(find.text('Account exports are not available yet.'), findsOneWidget);
    expect(find.text('Request export'), findsNothing);
  });

  testWidgets('an enabled fixture requests once and reports the server state', (
    tester,
  ) async {
    final exports = FakeExports();
    final harness = TestHarness(accountExports: exports);
    await harness.session.signIn(
      email: 'jos@example.test',
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
    expect(find.text('Status: none'), findsOneWidget);
    await tester.tap(find.text('Request export'));
    await tester.pumpAndSettle();
    expect(exports.requests, 1);
    expect(find.text('Status: building'), findsOneWidget);
    expect(find.text('Request export'), findsNothing);
  });

  testWidgets(
    'a completed download is shared then removed from the device cache',
    (tester) async {
      final exports = FakeExports()
        ..current = AccountExportStatus(
          requestId: requestId,
          status: 'ready',
          requestedAt: DateTime.utc(2026, 10),
          readyAt: DateTime.utc(2026, 10, 1),
          expiresAt: DateTime.utc(2090, 10, 2),
        );
      final harness = TestHarness(accountExports: exports);
      await harness.session.signIn(
        email: 'jos@example.test',
        password: 'correct-password',
      );
      final directory = Directory.systemTemp.createTempSync(
        'dayli-export-widget-',
      );
      File? shared;
      try {
        await tester.pumpWidget(
          AppScope(
            services: harness.services,
            child: MaterialApp(
              home: AccountExportScreen(
                temporaryDirectory: () async => directory,
                shareFile: (file, origin) async {
                  expect(origin.isEmpty, isFalse);
                  expect(await file.readAsBytes(), [80, 75, 3, 4]);
                  shared = file;
                },
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.runAsync(() async {
          await tester.tap(find.text('Download and share ZIP'));
          final deadline = DateTime.now().add(const Duration(seconds: 5));
          while ((shared == null || shared!.existsSync()) &&
              DateTime.now().isBefore(deadline)) {
            await Future<void>.delayed(const Duration(milliseconds: 10));
          }
        });
        await tester.pumpAndSettle();
        expect(exports.downloads, 1);
        expect(shared, isNotNull);
        expect(shared!.existsSync(), isFalse);
        expect(directory.listSync(), isEmpty);
      } finally {
        directory.deleteSync(recursive: true);
      }
    },
  );
}

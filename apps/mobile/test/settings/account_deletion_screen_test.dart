import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/settings/account_deletion_client.dart';
import 'package:dayli_mobile/settings/account_deletion_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

class FakeDeletion implements AccountDeletionClient {
  AccountDeletionStatus current = const AccountDeletionStatus(
    state: 'active',
    cancelUntil: null,
  );
  String? requestedPassword;
  String? cancelledPassword;

  @override
  Future<void> cancelWithPassword(String password) async {
    cancelledPassword = password;
    current = const AccountDeletionStatus(state: 'active', cancelUntil: null);
  }

  @override
  Future<void> requestWithPassword(String password) async {
    requestedPassword = password;
    current = AccountDeletionStatus(
      state: 'pending_deletion',
      cancelUntil: DateTime.utc(2026, 10, 9),
    );
  }

  @override
  Future<AccountDeletionStatus> status() async => current;
}

void main() {
  testWidgets('is explicit that requests are unavailable without activation', (
    tester,
  ) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      AppScope(
        services: harness.services,
        child: const MaterialApp(home: AccountDeletionScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('not available yet'), findsOneWidget);
    expect(find.text('Request deletion'), findsNothing);
  });

  testWidgets('requires consent then a fresh password before requesting', (
    tester,
  ) async {
    final deletion = FakeDeletion();
    final harness = TestHarness(accountDeletion: deletion);
    await tester.pumpWidget(
      AppScope(
        services: harness.services,
        child: const MaterialApp(home: AccountDeletionScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('accountDeletion.submit')))
          .onPressed,
      isNull,
    );
    await tester.tap(find.byKey(const Key('accountDeletion.consent')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('accountDeletion.submit')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('accountDeletion.password')),
      'current-password',
    );
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(deletion.requestedPassword, 'current-password');
    expect(harness.session.user, isNull);
  });

  testWidgets('uses cancellation only for a pending server status', (
    tester,
  ) async {
    final deletion = FakeDeletion()
      ..current = AccountDeletionStatus(
        state: 'pending_deletion',
        cancelUntil: DateTime.utc(2026, 10, 9),
      );
    final harness = TestHarness(accountDeletion: deletion);
    await tester.pumpWidget(
      AppScope(
        services: harness.services,
        child: const MaterialApp(home: AccountDeletionScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('accountDeletion.submit')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('accountDeletion.password')),
      'current-password',
    );
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(deletion.cancelledPassword, 'current-password');
  });
}

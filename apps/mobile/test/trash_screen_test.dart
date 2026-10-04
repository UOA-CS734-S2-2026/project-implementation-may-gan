import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/app/theme.dart';
import 'package:dayli_mobile/settings/trash_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

class TrashPostClient extends FakePostClient implements PostTrashClient {
  TrashPostClient(this.items);

  final List<TrashedPost> items;
  ApiResult<void> restoreResult = const ApiSuccess(null);
  Completer<void>? holdRestore;
  Completer<void>? holdList;
  var listCalls = 0;

  @override
  Future<ApiResult<List<TrashedPost>>> listTrash() async {
    listCalls++;
    await holdList?.future;
    return ApiSuccess(List.of(items));
  }

  @override
  Future<ApiResult<void>> restore(String postId) async {
    await holdRestore?.future;
    final result = restoreResult;
    if (result is ApiSuccess<void>) {
      items.removeWhere((post) => post.id == postId);
    }
    return result;
  }
}

TrashedPost item() => TrashedPost(
  id: 'post-1',
  localDate: '2026-09-24',
  restoreUntil: DateTime.utc(2026, 10, 2),
  purgeDueAt: DateTime.utc(2026, 10, 9),
  generation: 1,
  pendingCleanup: false,
);

void main() {
  testWidgets('shows deadlines and keeps content on restore conflict', (
    tester,
  ) async {
    final posts = TrashPostClient([item()]);
    posts.restoreResult = const ApiError(
      Conflict(
        'This day already has a replacement, so the original cannot be restored.',
        reason: 'day_occupied',
      ),
    );
    final harness = TestHarness(posts: posts);
    await harness.session.signIn(
      email: 'jos@example.test',
      password: 'correct-password',
    );
    await tester.pumpWidget(
      AppScope(
        services: harness.services,
        child: MaterialApp(
          theme: buildDayliTheme(useGoogleFonts: false),
          home: const TrashScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Dayli from 2026-09-24'), findsOneWidget);
    expect(find.textContaining('Permanent cleanup due'), findsOneWidget);
    await tester.tap(find.text('Restore'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('trash.error')), findsOneWidget);
    expect(find.textContaining('already has a replacement'), findsOneWidget);
    expect(find.text('Dayli from 2026-09-24'), findsOneWidget);
  });

  testWidgets('serializes pull-to-refresh while restore owns the item', (
    tester,
  ) async {
    final posts = TrashPostClient([item()])..holdRestore = Completer<void>();
    final harness = TestHarness(posts: posts);
    await harness.session.signIn(
      email: 'jos@example.test',
      password: 'correct-password',
    );
    await tester.pumpWidget(
      AppScope(
        services: harness.services,
        child: MaterialApp(
          theme: buildDayliTheme(useGoogleFonts: false),
          home: const TrashScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(posts.listCalls, 1);

    await tester.tap(find.text('Restore'));
    await tester.pump();
    expect(find.text('Restoring...'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, 400));
    await tester.pump();
    expect(posts.listCalls, 1);

    posts.holdRestore!.complete();
    await tester.pumpAndSettle();
    expect(find.text('Trash is empty.'), findsOneWidget);
    expect(find.text('Restoring...'), findsNothing);
  });

  testWidgets('disables restore exactly when the deadline passes', (
    tester,
  ) async {
    var now = DateTime.utc(2026, 9, 25, 3);
    final posts = TrashPostClient([
      TrashedPost(
        id: 'deadline-post',
        localDate: '2026-09-24',
        restoreUntil: now.add(const Duration(milliseconds: 100)),
        purgeDueAt: now.add(const Duration(days: 7)),
        generation: 1,
        pendingCleanup: false,
      ),
    ]);
    final harness = TestHarness(posts: posts, clock: () => now);
    await harness.session.signIn(
      email: 'jos@example.test',
      password: 'correct-password',
    );
    await tester.pumpWidget(
      AppScope(
        services: harness.services,
        child: MaterialApp(
          theme: buildDayliTheme(useGoogleFonts: false),
          home: const TrashScreen(),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Restore'), findsOneWidget);

    now = now.add(const Duration(milliseconds: 150));
    await tester.pump(const Duration(milliseconds: 150));
    expect(find.text('Restore period ended'), findsOneWidget);
  });

  testWidgets('discards a delayed Trash response after replacing the actor', (
    tester,
  ) async {
    final posts = TrashPostClient([item()])..holdList = Completer<void>();
    final harness = TestHarness(posts: posts);
    await harness.session.signIn(
      email: 'jos@example.test',
      password: 'correct-password',
    );
    await tester.pumpWidget(
      AppScope(
        services: harness.services,
        child: MaterialApp(
          theme: buildDayliTheme(useGoogleFonts: false),
          home: const TrashScreen(),
        ),
      ),
    );
    await tester.pump();

    harness.testUserId = 'replacement-actor';
    await harness.session.signIn(
      email: 'other@example.test',
      password: 'correct-password',
    );
    await tester.pump();
    posts.holdList!.complete();
    await tester.pump();

    expect(harness.session.user?.id, 'replacement-actor');
    expect(find.text('Dayli from 2026-09-24'), findsNothing);
  });

  testWidgets(
    'clears private Trash state and expires the current session on 401',
    (tester) async {
      final posts = TrashPostClient([item()])
        ..restoreResult = const ApiError(Unauthenticated());
      final harness = TestHarness(posts: posts);
      await harness.session.signIn(
        email: 'jos@example.test',
        password: 'correct-password',
      );
      await tester.pumpWidget(
        AppScope(
          services: harness.services,
          child: MaterialApp(
            theme: buildDayliTheme(useGoogleFonts: false),
            home: const TrashScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Restore'));
      for (
        var attempt = 0;
        attempt < 10 && harness.session.status != SessionStatus.signedOut;
        attempt++
      ) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(harness.session.status, SessionStatus.signedOut);
      await tester.pump();
      expect(find.text('Dayli from 2026-09-24'), findsNothing);
    },
  );
}

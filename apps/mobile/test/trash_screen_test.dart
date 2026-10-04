import 'package:dayli_mobile/api/api_failure.dart';
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

  @override
  Future<ApiResult<List<TrashedPost>>> listTrash() async =>
      ApiSuccess(List.of(items));

  @override
  Future<ApiResult<void>> restore(String postId) async {
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
    posts.restoreResult = const ApiError(Conflict('replacement'));
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
}

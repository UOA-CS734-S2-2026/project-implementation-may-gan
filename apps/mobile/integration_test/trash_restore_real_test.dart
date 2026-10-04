import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/app/theme.dart';
import 'package:dayli_mobile/settings/trash_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../test/support/fakes.dart';

class DeviceTrashClient extends FakePostClient implements PostTrashClient {
  DeviceTrashClient(this.items);

  final List<TrashedPost> items;
  final restored = <String>[];

  @override
  Future<ApiResult<List<TrashedPost>>> listTrash() async =>
      ApiSuccess(List.of(items));

  @override
  Future<ApiResult<void>> restore(String postId) async {
    restored.add(postId);
    items.removeWhere((post) => post.id == postId);
    return const ApiSuccess(null);
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'owner restores a post and its private Trash projection is cleared',
    (tester) async {
      final client = DeviceTrashClient([
        TrashedPost(
          id: 'device-trash-post',
          localDate: '2026-09-24',
          restoreUntil: DateTime.utc(2090, 10, 2),
          purgeDueAt: DateTime.utc(2090, 10, 9),
          generation: 4,
          pendingCleanup: false,
        ),
      ]);
      final harness = TestHarness(posts: client);
      await harness.session.signIn(
        email: 'device@example.test',
        password: 'correct-password',
      );
      var privateCacheInvalidations = 0;
      harness.postActivity.addListener(() => privateCacheInvalidations++);

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

      expect(client.restored, ['device-trash-post']);
      expect(privateCacheInvalidations, 1);
      expect(find.text('Dayli from 2026-09-24'), findsNothing);
      expect(find.text('Trash is empty.'), findsOneWidget);
    },
  );
}

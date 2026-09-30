import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/feed_client.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_player/video_player.dart';
import 'package:dayli_mobile/posts/private_media.dart';

import 'support/fakes.dart';

Future<void> signIn(WidgetTester tester, TestHarness harness) async {
  await tester.pumpWidget(
    DayliApp(services: harness.services, useGoogleFonts: false),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('landing.sign-in')));
  await tester.pumpAndSettle();
  await tester.enterText(
    find.byKey(const Key('auth.email')),
    'jos@example.test',
  );
  await tester.enterText(
    find.byKey(const Key('auth.password')),
    'correct-password',
  );
  await tester.tap(find.byKey(const Key('auth.submit')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('shows friends\' posts and loads the next page', (tester) async {
    final harness = TestHarness(
      feed: FakeFeedClient([
        ApiSuccess(
          FeedPage(
            items: [
              feedPost(
                '1',
                answer: 'Baked bread.',
                caption: 'Third time lucky',
              ),
            ],
            nextCursor: 'c1',
            hasMore: true,
          ),
        ),
        ApiSuccess(
          FeedPage(
            items: [feedPost('2', answer: 'Read half a novel.')],
            nextCursor: null,
            hasMore: false,
          ),
        ),
      ]),
    );
    await signIn(tester, harness);

    expect(find.text('Baked bread.'), findsOneWidget);
    // The word dump is only on the post; the answer is clamped to 3 lines.
    expect(find.text('Third time lucky'), findsNothing);
    final answer = tester.widget<Text>(
      find.byKey(const Key('home.feed.answer.1')),
    );
    expect(answer.maxLines, 3);
    expect(answer.overflow, TextOverflow.ellipsis);
    expect(find.text('@friend_1'), findsOneWidget);
    expect(find.text('24 Sep · 7/10'), findsOneWidget);
    expect(find.byKey(const Key('home.empty')), findsNothing);

    await tester.ensureVisible(find.byKey(const Key('home.feed.more')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('home.feed.more')));
    await tester.pumpAndSettle();

    expect(harness.feed.cursors, [null, 'c1']);
    expect(find.text('Read half a novel.'), findsOneWidget);
    expect(find.byKey(const Key('home.feed.more')), findsNothing);
  });

  testWidgets('shows the empty state when friends have not posted', (
    tester,
  ) async {
    final harness = TestHarness();
    await signIn(tester, harness);

    expect(find.byKey(const Key('home.empty')), findsOneWidget);
  });

  testWidgets('retries a feed that failed to load', (tester) async {
    final harness = TestHarness(
      feed: FakeFeedClient([
        const ApiError(NetworkUnavailable()),
        ApiSuccess(
          FeedPage(
            items: [feedPost('1', answer: 'Back online.')],
            nextCursor: null,
            hasMore: false,
          ),
        ),
      ]),
    );
    await signIn(tester, harness);

    expect(find.byKey(const Key('home.feed.error')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('home.feed.retry')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('home.feed.retry')));
    await tester.pumpAndSettle();

    expect(find.text('Back online.'), findsOneWidget);
    expect(find.byKey(const Key('home.feed.error')), findsNothing);
  });

  testWidgets('keeps loaded posts when a pull-to-refresh fails', (
    tester,
  ) async {
    final harness = TestHarness(
      feed: FakeFeedClient([
        ApiSuccess(
          FeedPage(
            items: [feedPost('1', answer: 'Still here.')],
            nextCursor: null,
            hasMore: false,
          ),
        ),
        const ApiError(NetworkUnavailable()),
      ]),
    );
    await signIn(tester, harness);

    await tester.fling(find.byType(ListView), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Still here.'), findsOneWidget);
    expect(find.byKey(const Key('home.feed.stale')), findsOneWidget);
  });

  testWidgets('signs out when the feed reports an expired session', (
    tester,
  ) async {
    final harness = TestHarness(
      feed: FakeFeedClient([const ApiError(Unauthenticated())]),
    );
    await signIn(tester, harness);

    expect(find.byKey(const Key('landing.sign-in')), findsOneWidget);
  });

  testWidgets('shows a photo on the card, and a still tile for a video', (
    tester,
  ) async {
    final harness = TestHarness(
      feed: FakeFeedClient([
        ApiSuccess(
          FeedPage(
            items: [
              feedPost('1', media: [attachment('m-1', 0)]),
              feedPost(
                '2',
                media: [attachment('m-2', 0, contentType: 'video/mp4')],
              ),
              feedPost('3'),
            ],
            nextCursor: null,
            hasMore: false,
          ),
        ),
      ]),
    );
    await signIn(tester, harness);

    expect(find.byKey(const Key('home.feed.photo.1')), findsOneWidget);
    expect(find.byKey(const Key('home.feed.video.2')), findsOneWidget);
    // Videos never play in the feed.
    expect(find.byType(VideoPlayer), findsNothing);
    expect(find.byType(PrivateVideo), findsNothing);
  });

  testWidgets('starts again from the new day when more is loaded after '
      'midnight', (tester) async {
    final harness = TestHarness(
      feed: FakeFeedClient([
        ApiSuccess(
          FeedPage(
            items: [feedPost('1', answer: 'Baked bread.')],
            nextCursor: 'c1',
            hasMore: true,
          ),
        ),
        const ApiError(Expired()),
        ApiSuccess(
          FeedPage(
            items: [feedPost('2', answer: 'A new day.')],
            nextCursor: null,
            hasMore: false,
          ),
        ),
      ]),
    );
    await signIn(tester, harness);

    await tester.ensureVisible(find.byKey(const Key('home.feed.more')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('home.feed.more')));
    await tester.pumpAndSettle();

    expect(harness.feed.cursors, [null, 'c1', null]);
    expect(find.text('A new day.'), findsOneWidget);
    expect(find.text('Baked bread.'), findsNothing);
    expect(find.byKey(const Key('home.feed.moreError')), findsNothing);
  });

  testWidgets('reloads the feed when the app comes back', (tester) async {
    final harness = TestHarness(
      feed: FakeFeedClient([
        ApiSuccess(
          FeedPage(
            items: [feedPost('1', answer: 'Baked bread.')],
            nextCursor: null,
            hasMore: false,
          ),
        ),
        ApiSuccess(
          FeedPage(
            items: [feedPost('2', answer: 'A new day.')],
            nextCursor: null,
            hasMore: false,
          ),
        ),
      ]),
    );
    await signIn(tester, harness);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.text('A new day.'), findsOneWidget);
  });
}

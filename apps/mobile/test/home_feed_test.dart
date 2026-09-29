import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/feed_client.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

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
    expect(find.text('Third time lucky'), findsOneWidget);
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
}

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/feed_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'home_feed_test.dart' show signIn;
import 'support/fakes.dart';

TestHarness harnessWith(FakePostClient posts) => TestHarness(
  feed: FakeFeedClient([
    ApiSuccess(
      FeedPage(items: [feedPost('1')], nextCursor: null, hasMore: false),
    ),
  ]),
  posts: posts,
);

Future<void> openPost(WidgetTester tester, TestHarness harness) async {
  await signIn(tester, harness);
  await tester.ensureVisible(find.byKey(const Key('home.feed.post.1')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('home.feed.post.1')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('opens a friend\'s post from the feed', (tester) async {
    final semantics = tester.ensureSemantics();
    final harness = harnessWith(
      FakePostClient([
        ApiSuccess(
          postDetail(
            '1',
            answer: 'Walked the coastal track.',
            caption: 'Tide was in.',
          ),
        ),
      ]),
    );
    await openPost(tester, harness);

    expect(harness.posts.requested, ['1']);
    expect(find.text('Walked the coastal track.'), findsOneWidget);
    expect(find.text('Tide was in.'), findsOneWidget);
    expect(find.text('What made you smile today?'), findsOneWidget);
    expect(find.bySemanticsLabel('Rated 8 out of 10'), findsOneWidget);
    expect(find.text('Tuesday, 29 September 2026'), findsOneWidget);

    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('home.feed.post.1')), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('shows the author their audience and edited marker', (
    tester,
  ) async {
    final harness = harnessWith(
      FakePostClient([
        ApiSuccess(
          postDetail('1', audience: 'solo', viewerIsAuthor: true, edited: true),
        ),
      ]),
    );
    await openPost(tester, harness);

    expect(
      find.text('Tuesday, 29 September 2026 · Edited · Only you'),
      findsOneWidget,
    );
    expect(find.text('Word dump'), findsNothing);
  });

  testWidgets('shows one message for a missing or hidden post', (tester) async {
    final harness = harnessWith(FakePostClient([const ApiError(NotFound())]));
    await openPost(tester, harness);

    expect(find.byKey(const Key('post.unavailable')), findsOneWidget);
    expect(find.byKey(const Key('post.retry')), findsNothing);
  });

  testWidgets('retries a post that failed to load', (tester) async {
    final harness = harnessWith(
      FakePostClient([
        const ApiError(NetworkUnavailable()),
        ApiSuccess(postDetail('1', answer: 'Back online.')),
      ]),
    );
    await openPost(tester, harness);

    expect(find.byKey(const Key('post.error')), findsOneWidget);
    await tester.tap(find.byKey(const Key('post.retry')));
    await tester.pumpAndSettle();
    expect(find.text('Back online.'), findsOneWidget);
  });

  testWidgets('removes a post whose access was revoked on refresh', (
    tester,
  ) async {
    final harness = harnessWith(
      FakePostClient([
        ApiSuccess(postDetail('1', answer: 'Soon hidden.')),
        const ApiError(NotFound()),
      ]),
    );
    await openPost(tester, harness);
    expect(find.text('Soon hidden.'), findsOneWidget);

    await tester.fling(find.byType(ListView), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Soon hidden.'), findsNothing);
    expect(find.byKey(const Key('post.unavailable')), findsOneWidget);
  });

  testWidgets('keeps the post with a notice when a refresh fails', (
    tester,
  ) async {
    final harness = harnessWith(
      FakePostClient([
        ApiSuccess(postDetail('1', answer: 'Still here.')),
        const ApiError(NetworkUnavailable()),
      ]),
    );
    await openPost(tester, harness);

    await tester.fling(find.byType(ListView), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Still here.'), findsOneWidget);
    expect(find.byKey(const Key('post.stale')), findsOneWidget);
  });
}

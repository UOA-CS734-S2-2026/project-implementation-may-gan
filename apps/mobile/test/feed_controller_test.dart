import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/feed_client.dart';
import 'package:dayli_mobile/home/feed_controller.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

FeedPage page(List<String> ids, {String? next}) => FeedPage(
  items: [for (final id in ids) feedPost(id)],
  nextCursor: next,
  hasMore: next != null,
);

class HeldFeedClient implements FeedClient {
  final pending = <Completer<ApiResult<FeedPage>>>[];

  @override
  Future<ApiResult<FeedPage>> page({String? cursor}) {
    final completer = Completer<ApiResult<FeedPage>>();
    pending.add(completer);
    return completer.future;
  }
}

void main() {
  test(
    'loads the first page, then appends the next without duplicates',
    () async {
      final client = FakeFeedClient([
        ApiSuccess(page(['1', '2'], next: 'c1')),
        ApiSuccess(page(['2', '3'])),
      ]);
      final feed = FeedController(client);

      expect(feed.loaded, isFalse);
      await feed.refresh();
      expect(feed.posts.map((post) => post.id), ['1', '2']);
      expect(feed.hasMore, isTrue);

      await feed.loadMore();
      expect(client.cursors, [null, 'c1']);
      expect(feed.posts.map((post) => post.id), ['1', '2', '3']);
      expect(feed.hasMore, isFalse);

      await feed.loadMore();
      expect(client.cursors, hasLength(2));
    },
  );

  test('keeps earlier posts visible when a refresh fails', () async {
    final feed = FeedController(
      FakeFeedClient([
        ApiSuccess(page(['1'])),
        const ApiError(NetworkUnavailable()),
      ]),
    );

    await feed.refresh();
    final failure = await feed.refresh();

    expect(failure, isA<NetworkUnavailable>());
    expect(feed.failure, isA<NetworkUnavailable>());
    expect(feed.posts.map((post) => post.id), ['1']);
  });

  test('replaces posts that are no longer visible on refresh', () async {
    final feed = FeedController(
      FakeFeedClient([
        ApiSuccess(page(['1', '2'])),
        ApiSuccess(page(['2'])),
      ]),
    );

    await feed.refresh();
    await feed.refresh();

    expect(feed.posts.map((post) => post.id), ['2']);
  });

  test('reports a failed next page without losing loaded posts', () async {
    final feed = FeedController(
      FakeFeedClient([
        ApiSuccess(page(['1'], next: 'c1')),
        const ApiError(ServiceUnavailable()),
      ]),
    );

    await feed.refresh();
    await feed.loadMore();

    expect(feed.moreFailure, isA<ServiceUnavailable>());
    expect(feed.posts.map((post) => post.id), ['1']);
    expect(feed.hasMore, isTrue);
  });

  test('drops a page that a newer refresh superseded', () async {
    final client = HeldFeedClient();
    final feed = FeedController(client);

    final first = feed.refresh();
    await Future<void>.delayed(Duration.zero);
    client.pending[0].complete(ApiSuccess(page(['1'], next: 'c1')));
    await first;

    final more = feed.loadMore();
    final refreshed = feed.refresh();
    await Future<void>.delayed(Duration.zero);
    client.pending[2].complete(ApiSuccess(page(['9'])));
    await refreshed;
    client.pending[1].complete(ApiSuccess(page(['stale'])));
    await more;

    expect(feed.posts.map((post) => post.id), ['9']);
    expect(feed.loadingMore, isFalse);
  });
}

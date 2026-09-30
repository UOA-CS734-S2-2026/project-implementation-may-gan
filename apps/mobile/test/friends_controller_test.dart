import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/friends/friends_controller.dart';
import 'package:flutter_test/flutter_test.dart';

const _emptyRequests = FriendRequestPage(
  items: [],
  nextCursor: null,
  hasMore: false,
);

class DelayedFriendsClient implements FriendsClient {
  final loadResult = Completer<ApiResult<FriendsSnapshot>>();
  final searchResult = Completer<ApiResult<FriendPage>>();
  @override
  Future<ApiResult<FriendsSnapshot>> load() => loadResult.future;
  @override
  Future<ApiResult<FriendPage>> search(String query, {String? cursor}) =>
      searchResult.future;
  @override
  Future<ApiResult<FriendPage>> loadFriends({String? cursor}) async =>
      const ApiSuccess(FriendPage(items: [], nextCursor: null, hasMore: false));
  @override
  Future<ApiResult<FriendRequestPage>> loadRequests(
    String direction, {
    String? cursor,
  }) async => const ApiSuccess(_emptyRequests);
  @override
  Future<ApiResult<FriendCard>> profile(String username) async =>
      const ApiError(ServiceUnavailable());
  @override
  Future<ApiResult<void>> accept(String requestId) async =>
      const ApiSuccess(null);
  @override
  Future<ApiResult<void>> cancel(String requestId) async =>
      const ApiSuccess(null);
  @override
  Future<ApiResult<void>> decline(String requestId) async =>
      const ApiSuccess(null);
  @override
  Future<ApiResult<void>> remove(String userId) async => const ApiSuccess(null);
  @override
  Future<ApiResult<void>> send(String userId) async => const ApiSuccess(null);
}

class PagingFriendsClient implements FriendsClient {
  @override
  Future<ApiResult<FriendsSnapshot>> load() async => const ApiSuccess(
    FriendsSnapshot(
      friends: FriendPage(
        items: [
          FriendCard(
            id: 'a',
            username: 'ada',
            displayName: 'Ada',
            relationship: 'friends',
          ),
        ],
        nextCursor: 'next',
        hasMore: true,
      ),
      incoming: _emptyRequests,
      outgoing: _emptyRequests,
    ),
  );
  @override
  Future<ApiResult<FriendPage>> loadFriends({String? cursor}) async =>
      const ApiSuccess(
        FriendPage(
          items: [
            FriendCard(
              id: 'b',
              username: 'bea',
              displayName: 'Bea',
              relationship: 'friends',
            ),
          ],
          nextCursor: null,
          hasMore: false,
        ),
      );
  @override
  Future<ApiResult<FriendRequestPage>> loadRequests(
    String direction, {
    String? cursor,
  }) async => const ApiSuccess(_emptyRequests);
  @override
  Future<ApiResult<FriendPage>> search(String query, {String? cursor}) async =>
      const ApiSuccess(FriendPage(items: [], nextCursor: null, hasMore: false));
  @override
  Future<ApiResult<FriendCard>> profile(String username) async =>
      const ApiError(ServiceUnavailable());
  @override
  Future<ApiResult<void>> accept(String requestId) async =>
      const ApiSuccess(null);
  @override
  Future<ApiResult<void>> cancel(String requestId) async =>
      const ApiSuccess(null);
  @override
  Future<ApiResult<void>> decline(String requestId) async =>
      const ApiSuccess(null);
  @override
  Future<ApiResult<void>> remove(String userId) async => const ApiSuccess(null);
  @override
  Future<ApiResult<void>> send(String userId) async => const ApiSuccess(null);
}

void main() {
  test('ignores an in-flight load after the active account changes', () async {
    var activeUserId = 'alice';
    final client = DelayedFriendsClient();
    final controller = FriendsController(
      client: client,
      activeUserId: () => activeUserId,
    );
    final loading = controller.load();
    activeUserId = 'bob';
    client.loadResult.complete(
      const ApiSuccess(
        FriendsSnapshot(
          friends: FriendPage(items: [], nextCursor: null, hasMore: false),
          incoming: _emptyRequests,
          outgoing: _emptyRequests,
        ),
      ),
    );
    await loading;
    expect(controller.snapshot, isNull);
    expect(controller.loading, isTrue);
  });

  test(
    'keeps bootstrap and search independent when search completes first',
    () async {
      final client = DelayedFriendsClient();
      final controller = FriendsController(
        client: client,
        activeUserId: () => 'alice',
      );
      final bootstrap = controller.load();
      final searching = controller.search('se');
      await Future<void>.delayed(const Duration(milliseconds: 350));
      client.searchResult.complete(
        const ApiSuccess(
          FriendPage(
            items: [
              FriendCard(
                id: 'search',
                username: 'search',
                displayName: 'Search',
                relationship: 'none',
              ),
            ],
            nextCursor: null,
            hasMore: false,
          ),
        ),
      );
      await searching;
      expect(controller.results.items.single.displayName, 'Search');
      client.loadResult.complete(
        const ApiSuccess(
          FriendsSnapshot(
            friends: FriendPage(
              items: [
                FriendCard(
                  id: 'friend',
                  username: 'friend',
                  displayName: 'Friend',
                  relationship: 'friends',
                ),
              ],
              nextCursor: null,
              hasMore: false,
            ),
            incoming: _emptyRequests,
            outgoing: _emptyRequests,
          ),
        ),
      );
      await bootstrap;
      expect(controller.loading, isFalse);
      expect(controller.snapshot!.friends.items.single.displayName, 'Friend');
    },
  );

  test('keeps a deferred search valid when bootstrap finishes first', () async {
    final client = DelayedFriendsClient();
    final controller = FriendsController(
      client: client,
      activeUserId: () => 'alice',
    );
    final bootstrap = controller.load();
    final searching = controller.search('se');
    client.loadResult.complete(
      const ApiSuccess(
        FriendsSnapshot(
          friends: FriendPage(
            items: [
              FriendCard(
                id: 'friend',
                username: 'friend',
                displayName: 'Friend',
                relationship: 'friends',
              ),
            ],
            nextCursor: null,
            hasMore: false,
          ),
          incoming: _emptyRequests,
          outgoing: _emptyRequests,
        ),
      ),
    );
    await bootstrap;
    await Future<void>.delayed(const Duration(milliseconds: 350));
    client.searchResult.complete(
      const ApiSuccess(
        FriendPage(
          items: [
            FriendCard(
              id: 'search',
              username: 'search',
              displayName: 'Search',
              relationship: 'none',
            ),
          ],
          nextCursor: null,
          hasMore: false,
        ),
      ),
    );
    await searching;
    expect(controller.loading, isFalse);
    expect(controller.snapshot!.friends.items.single.displayName, 'Friend');
    expect(controller.results.items.single.displayName, 'Search');
  });

  test(
    'appends one bounded friends continuation without duplicate cards',
    () async {
      final controller = FriendsController(
        client: PagingFriendsClient(),
        activeUserId: () => 'alice',
      );
      await controller.load();
      await controller.loadMoreFriends();
      expect(controller.snapshot!.friends.items.map((item) => item.id), [
        'a',
        'b',
      ]);
      expect(controller.snapshot!.friends.hasMore, isFalse);
    },
  );
}

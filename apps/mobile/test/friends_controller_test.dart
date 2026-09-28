import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/friends/friends_controller.dart';
import 'package:flutter_test/flutter_test.dart';

class DelayedFriendsClient implements FriendsClient {
  final loadResult = Completer<ApiResult<FriendsSnapshot>>();
  @override
  Future<ApiResult<FriendsSnapshot>> load() => loadResult.future;
  @override
  Future<ApiResult<FriendPage>> search(String query, {String? cursor}) async =>
      const ApiSuccess(FriendPage(items: [], nextCursor: null, hasMore: false));
  @override
  Future<ApiResult<FriendPage>> loadFriends({String? cursor}) async =>
      const ApiSuccess(FriendPage(items: [], nextCursor: null, hasMore: false));
  @override
  Future<ApiResult<FriendRequestPage>> loadRequests(
    String direction, {
    String? cursor,
  }) async => const ApiSuccess(
    FriendRequestPage(items: [], nextCursor: null, hasMore: false),
  );
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
          incoming: FriendRequestPage(
            items: [],
            nextCursor: null,
            hasMore: false,
          ),
          outgoing: FriendRequestPage(
            items: [],
            nextCursor: null,
            hasMore: false,
          ),
        ),
      ),
    );
    await loading;

    expect(controller.snapshot, isNull);
    expect(controller.loading, isTrue);
  });
}

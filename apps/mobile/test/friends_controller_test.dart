import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/friends/friends_controller.dart';
import 'package:flutter_test/flutter_test.dart';

class DelayedFriendsClient implements FriendsClient {
  final loadResult = Completer<ApiResult<FriendsSnapshot>>();
  @override Future<ApiResult<FriendsSnapshot>> load() => loadResult.future;
  @override Future<ApiResult<List<FriendCard>>> search(String query) async => const ApiSuccess([]);
  @override Future<ApiResult<void>> accept(String requestId) async => const ApiSuccess(null);
  @override Future<ApiResult<void>> cancel(String requestId) async => const ApiSuccess(null);
  @override Future<ApiResult<void>> decline(String requestId) async => const ApiSuccess(null);
  @override Future<ApiResult<void>> remove(String userId) async => const ApiSuccess(null);
  @override Future<ApiResult<void>> send(String userId) async => const ApiSuccess(null);
}

void main() {
  test('ignores an in-flight load after the active account changes', () async {
    var activeUserId = 'alice';
    final client = DelayedFriendsClient();
    final controller = FriendsController(client: client, activeUserId: () => activeUserId);

    final loading = controller.load();
    activeUserId = 'bob';
    client.loadResult.complete(const ApiSuccess(FriendsSnapshot(friends: [], requests: [])));
    await loading;

    expect(controller.snapshot, isNull);
    expect(controller.loading, isTrue);
  });
}

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';

List<T> _merge<T extends Object>(List<T> current, List<T> incoming) {
  final ids = <String>{};
  final merged = <T>[];
  for (final item in [...current, ...incoming]) {
    final id = switch (item) {
      FriendCard(:final id) => id,
      FriendRequest(:final id) => id,
      _ => item.toString(),
    };
    if (ids.add(id)) merged.add(item);
  }
  return merged;
}

/// Keeps only responses belonging to the active account and latest search.
class FriendsController extends ChangeNotifier {
  FriendsController({required this.client, required this.activeUserId});
  final FriendsClient client;
  final String? Function() activeUserId;
  int _generation = 0;
  FriendsSnapshot? snapshot;
  FriendPage results = const FriendPage(
    items: [],
    nextCursor: null,
    hasMore: false,
  );
  ApiFailure? failure;
  bool loading = false;
  bool searching = false;
  String? busyId;

  Future<void> load() async {
    final userId = activeUserId();
    final generation = ++_generation;
    loading = true;
    failure = null;
    notifyListeners();
    final result = await client.load();
    if (generation != _generation || userId != activeUserId()) return;
    loading = false;
    switch (result) {
      case ApiSuccess(value: final value):
        snapshot = value;
      case ApiError(failure: final value):
        failure = value;
    }
    notifyListeners();
  }

  Future<void> search(String value) async {
    final query = value.trim();
    final userId = activeUserId();
    final generation = ++_generation;
    if (query.length < 2) {
      results = const FriendPage(items: [], nextCursor: null, hasMore: false);
      searching = false;
      notifyListeners();
      return;
    }
    searching = true;
    failure = null;
    notifyListeners();
    await Future<void>.delayed(const Duration(milliseconds: 300));
    if (generation != _generation || userId != activeUserId()) return;
    final result = await client.search(query);
    if (generation != _generation || userId != activeUserId()) return;
    searching = false;
    switch (result) {
      case ApiSuccess(value: final value):
        results = value;
      case ApiError(failure: final value):
        failure = value;
    }
    notifyListeners();
  }

  Future<void> loadMoreFriends() => _loadMore(
    snapshot?.friends.nextCursor,
    (cursor) => client.loadFriends(cursor: cursor),
    (page) => snapshot = FriendsSnapshot(
      friends: FriendPage(
        items: _merge(snapshot?.friends.items ?? [], page.items),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      ),
      incoming: snapshot!.incoming,
      outgoing: snapshot!.outgoing,
    ),
  );
  Future<void> loadMoreIncoming() => _loadMore(
    snapshot?.incoming.nextCursor,
    (cursor) => client.loadRequests('incoming', cursor: cursor),
    (page) => snapshot = FriendsSnapshot(
      friends: snapshot!.friends,
      incoming: FriendRequestPage(
        items: _merge(snapshot?.incoming.items ?? [], page.items),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      ),
      outgoing: snapshot!.outgoing,
    ),
  );
  Future<void> loadMoreOutgoing() => _loadMore(
    snapshot?.outgoing.nextCursor,
    (cursor) => client.loadRequests('outgoing', cursor: cursor),
    (page) => snapshot = FriendsSnapshot(
      friends: snapshot!.friends,
      incoming: snapshot!.incoming,
      outgoing: FriendRequestPage(
        items: _merge(snapshot?.outgoing.items ?? [], page.items),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      ),
    ),
  );
  Future<void> loadMoreSearch(String query) async {
    final cursor = results.nextCursor;
    if (cursor == null) return;
    final userId = activeUserId();
    final generation = ++_generation;
    final result = await client.search(query.trim(), cursor: cursor);
    if (generation != _generation || userId != activeUserId()) return;
    switch (result) {
      case ApiSuccess(value: final value):
        results = FriendPage(
          items: _merge(results.items, value.items),
          nextCursor: value.nextCursor,
          hasMore: value.hasMore,
        );
      case ApiError(failure: final value):
        failure = value;
    }
    notifyListeners();
  }

  Future<void> _loadMore<T extends Object>(
    String? cursor,
    Future<ApiResult<T>> Function(String cursor) operation,
    void Function(T page) apply,
  ) async {
    if (cursor == null) return;
    final userId = activeUserId();
    final generation = ++_generation;
    final result = await operation(cursor);
    if (generation != _generation || userId != activeUserId()) return;
    switch (result) {
      case ApiSuccess(value: final value):
        apply(value);
      case ApiError(failure: final value):
        failure = value;
    }
    notifyListeners();
  }

  Future<void> mutate(
    String id,
    Future<ApiResult<void>> Function() operation,
  ) async {
    final userId = activeUserId();
    final generation = ++_generation;
    busyId = id;
    failure = null;
    notifyListeners();
    final result = await operation();
    if (generation != _generation || userId != activeUserId()) return;
    busyId = null;
    if (result case ApiError(failure: final value)) {
      failure = value;
      notifyListeners();
      return;
    }
    await load();
  }

  void resetForAccount() {
    _generation++;
    snapshot = null;
    results = const FriendPage(items: [], nextCursor: null, hasMore: false);
    failure = null;
    busyId = null;
    loading = false;
    searching = false;
    notifyListeners();
  }
}

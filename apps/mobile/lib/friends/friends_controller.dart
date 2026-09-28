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

/// Keeps only responses belonging to the active account and latest operation.
class FriendsController extends ChangeNotifier {
  FriendsController({required this.client, required this.activeUserId});
  final FriendsClient client;
  final String? Function() activeUserId;
  int _sessionEpoch = 0;
  int _bootstrapGeneration = 0;
  int _searchGeneration = 0;
  int _mutationGeneration = 0;
  final Map<String, int> _continuationGeneration = {};
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

  bool _current(int epoch, String? userId) =>
      epoch == _sessionEpoch && userId == activeUserId();

  Future<void> load() async {
    final userId = activeUserId();
    final epoch = _sessionEpoch;
    final generation = ++_bootstrapGeneration;
    loading = true;
    failure = null;
    notifyListeners();
    final result = await client.load();
    if (!_current(epoch, userId) || generation != _bootstrapGeneration) return;
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
    final epoch = _sessionEpoch;
    final generation = ++_searchGeneration;
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
    if (!_current(epoch, userId) || generation != _searchGeneration) return;
    final result = await client.search(query);
    if (!_current(epoch, userId) || generation != _searchGeneration) return;
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
    'friends',
    snapshot?.friends.nextCursor,
    (cursor) => client.loadFriends(cursor: cursor),
    (page) {
      final current = snapshot;
      if (current == null) return;
      snapshot = FriendsSnapshot(
        friends: FriendPage(
          items: _merge(current.friends.items, page.items),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        ),
        incoming: current.incoming,
        outgoing: current.outgoing,
      );
    },
  );
  Future<void> loadMoreIncoming() => _loadMore(
    'incoming',
    snapshot?.incoming.nextCursor,
    (cursor) => client.loadRequests('incoming', cursor: cursor),
    (page) {
      final current = snapshot;
      if (current == null) return;
      snapshot = FriendsSnapshot(
        friends: current.friends,
        incoming: FriendRequestPage(
          items: _merge(current.incoming.items, page.items),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        ),
        outgoing: current.outgoing,
      );
    },
  );
  Future<void> loadMoreOutgoing() => _loadMore(
    'outgoing',
    snapshot?.outgoing.nextCursor,
    (cursor) => client.loadRequests('outgoing', cursor: cursor),
    (page) {
      final current = snapshot;
      if (current == null) return;
      snapshot = FriendsSnapshot(
        friends: current.friends,
        incoming: current.incoming,
        outgoing: FriendRequestPage(
          items: _merge(current.outgoing.items, page.items),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        ),
      );
    },
  );

  Future<void> loadMoreSearch(String query) async {
    final cursor = results.nextCursor;
    if (cursor == null) return;
    final userId = activeUserId();
    final epoch = _sessionEpoch;
    final generation = ++_searchGeneration;
    final result = await client.search(query.trim(), cursor: cursor);
    if (!_current(epoch, userId) || generation != _searchGeneration) return;
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
    String key,
    String? cursor,
    Future<ApiResult<T>> Function(String cursor) operation,
    void Function(T page) apply,
  ) async {
    if (cursor == null) return;
    final userId = activeUserId();
    final epoch = _sessionEpoch;
    final generation = (_continuationGeneration[key] ?? 0) + 1;
    _continuationGeneration[key] = generation;
    final result = await operation(cursor);
    if (!_current(epoch, userId) ||
        generation != _continuationGeneration[key]) {
      return;
    }
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
    final epoch = _sessionEpoch;
    final generation = ++_mutationGeneration;
    busyId = id;
    failure = null;
    notifyListeners();
    final result = await operation();
    if (!_current(epoch, userId) || generation != _mutationGeneration) return;
    busyId = null;
    if (result case ApiError(failure: final value)) {
      failure = value;
      notifyListeners();
      return;
    }
    await load();
  }

  void resetForAccount() {
    _sessionEpoch++;
    snapshot = null;
    results = const FriendPage(items: [], nextCursor: null, hasMore: false);
    failure = null;
    busyId = null;
    loading = false;
    searching = false;
    notifyListeners();
  }
}

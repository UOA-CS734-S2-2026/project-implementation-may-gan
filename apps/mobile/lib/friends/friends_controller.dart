import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_failure.dart';
import '../api/friends_client.dart';

/// Keeps only responses belonging to the active account and latest search.
class FriendsController extends ChangeNotifier {
  FriendsController({required this.client, required this.activeUserId});
  final FriendsClient client;
  final String? Function() activeUserId;
  int _generation = 0;
  FriendsSnapshot? snapshot;
  List<FriendCard> results = const [];
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
      results = const [];
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
    results = const [];
    failure = null;
    busyId = null;
    loading = false;
    searching = false;
    notifyListeners();
  }
}

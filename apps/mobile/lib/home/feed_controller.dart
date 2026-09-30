import 'package:flutter/foundation.dart';

import '../api/api_failure.dart';
import '../api/feed_client.dart';

/// The friends feed: the first page on refresh, then further pages on demand.
///
/// A refresh replaces the list; a later page appends only posts not already
/// shown. Results from a request that a newer refresh superseded are dropped,
/// so a slow page can never mix into a fresher list.
class FeedController extends ChangeNotifier {
  FeedController(this._client);

  final FeedClient _client;

  List<FeedPost> _posts = const [];
  String? _cursor;
  bool _hasMore = false;
  bool _loaded = false;
  bool _refreshing = false;
  bool _loadingMore = false;
  ApiFailure? _failure;
  ApiFailure? _moreFailure;
  int _generation = 0;

  List<FeedPost> get posts => _posts;
  bool get hasMore => _hasMore;

  /// False until the first page has loaded or failed.
  bool get loaded => _loaded;
  bool get refreshing => _refreshing;
  bool get loadingMore => _loadingMore;

  /// The last refresh failure. Posts from an earlier load stay visible.
  ApiFailure? get failure => _failure;
  ApiFailure? get moreFailure => _moreFailure;

  Future<ApiFailure?> refresh() async {
    final generation = ++_generation;
    _refreshing = true;
    _loadingMore = false;
    notifyListeners();

    final result = await _client.page();
    if (generation != _generation) return null;
    _refreshing = false;
    _loaded = true;
    switch (result) {
      case ApiSuccess(:final value):
        _posts = _unique(value.items, const []);
        _cursor = value.nextCursor;
        _hasMore = value.hasMore && value.nextCursor != null;
        _failure = null;
        _moreFailure = null;
      case ApiError(:final failure):
        _failure = failure;
    }
    notifyListeners();
    return _failure;
  }

  Future<ApiFailure?> loadMore() async {
    final cursor = _cursor;
    if (!_hasMore || cursor == null || _loadingMore || _refreshing) {
      return null;
    }
    final generation = _generation;
    _loadingMore = true;
    _moreFailure = null;
    notifyListeners();

    final result = await _client.page(cursor: cursor);
    if (generation != _generation) return null;
    _loadingMore = false;
    switch (result) {
      case ApiSuccess(:final value):
        _posts = _unique(value.items, _posts);
        _cursor = value.nextCursor;
        _hasMore = value.hasMore && value.nextCursor != null;
      case ApiError(:final failure):
        _moreFailure = failure;
    }
    notifyListeners();
    return _moreFailure;
  }

  static List<FeedPost> _unique(List<FeedPost> page, List<FeedPost> shown) {
    final ids = {for (final post in shown) post.id};
    return [
      ...shown,
      for (final post in page)
        if (ids.add(post.id)) post,
    ];
  }
}

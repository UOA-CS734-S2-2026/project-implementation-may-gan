/// One page of posts, newest Auckland day first.
class PostPage<T> {
  const PostPage({
    required this.items,
    required this.nextCursor,
    required this.hasMore,
  });

  final List<T> items;
  final String? nextCursor;
  final bool hasMore;

  /// Null when the envelope is malformed. A malformed item is skipped rather
  /// than failing the whole page.
  static PostPage<T>? tryParse<T>(
    Object? json,
    T? Function(Object? item) parseItem,
  ) {
    if (json is! Map<String, Object?> || json['items'] is! List) return null;
    final nextCursor = json['nextCursor'];
    return PostPage(
      items: [for (final item in json['items']! as List) ?parseItem(item)],
      nextCursor: nextCursor is String ? nextCursor : null,
      hasMore: json['hasMore'] == true,
    );
  }
}

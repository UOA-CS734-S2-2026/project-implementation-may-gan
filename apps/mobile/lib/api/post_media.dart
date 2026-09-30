/// One attached photo or video with a private, short-lived download URL.
/// The URL works for anyone who has it until [expiresAt]: never log or store it.
class PostMedia {
  const PostMedia({
    required this.id,
    required this.contentType,
    required this.order,
    required this.url,
    required this.expiresAt,
  });

  final String id;
  final String contentType;
  final int order;

  /// Null when media storage is unavailable.
  final Uri? url;
  final DateTime? expiresAt;

  bool get isVideo => contentType.startsWith('video/');

  static PostMedia? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final id = json['id'];
    final contentType = json['contentType'];
    final order = json['order'];
    final url = json['url'];
    if (id is! String ||
        contentType is! String ||
        order is! int ||
        (url != null && url is! String)) {
      return null;
    }
    final uri = url is String ? Uri.tryParse(url) : null;
    return PostMedia(
      id: id,
      contentType: contentType,
      order: order,
      // Only HTTPS is ever signed; anything else is treated as unavailable.
      url: uri != null && uri.isScheme('https') ? uri : null,
      expiresAt: DateTime.tryParse('${json['expiresAt']}'),
    );
  }

  /// Skips malformed items rather than failing the post, and keeps the
  /// server's display order.
  static List<PostMedia> parseList(Object? json) {
    if (json is! List) return const [];
    return [for (final item in json) ?PostMedia.tryParse(item)]
      ..sort((a, b) => a.order.compareTo(b.order));
  }

  @override
  String toString() => 'PostMedia($id, $contentType)';
}

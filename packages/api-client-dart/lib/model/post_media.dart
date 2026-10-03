//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PostMedia {
  /// Returns a new [PostMedia] instance.
  PostMedia({
    required this.id,
    required this.contentType,
    required this.order,
    required this.url,
    required this.expiresAt,
  });

  final String id;

  final PostMediaContentType contentType;

  /// Minimum value: 0
  final int order;

  /// A private download URL that expires at expiresAt. When media storage is unavailable, a response that would include media is a 503 instead.
  final String url;

  /// When url stops working. Fetch the post again, or GET /api/v1/posts/{postId}/media/{mediaId}, for a fresh one.
  final DateTime expiresAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PostMedia &&
          other.id == id &&
          other.contentType == contentType &&
          other.order == order &&
          other.url == url &&
          other.expiresAt == expiresAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (contentType.hashCode) +
      (order.hashCode) +
      (url.hashCode) +
      (expiresAt.hashCode);

  @override
  String toString() =>
      'PostMedia[id=$id, contentType=$contentType, order=$order, url=$url, expiresAt=$expiresAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'contentType'] = this.contentType;
    json[r'order'] = this.order;
    json[r'url'] = this.url;
    json[r'expiresAt'] = this.expiresAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [PostMedia] and returns a new one where some of the
  /// properties have changed.
  PostMedia copyWith({
    String? id,
    PostMediaContentType? contentType,
    int? order,
    String? url,
    DateTime? expiresAt,
  }) =>
      PostMedia(
        id: id ?? this.id,
        contentType: contentType ?? this.contentType,
        order: order ?? this.order,
        url: url ?? this.url,
        expiresAt: expiresAt ?? this.expiresAt,
      );

  /// Returns a new [PostMedia] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PostMedia? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "PostMedia[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "PostMedia[id]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'),
            'Required key "PostMedia[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null,
            'Required key "PostMedia[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'order'),
            'Required key "PostMedia[order]" is missing from JSON.');
        assert(json[r'order'] != null,
            'Required key "PostMedia[order]" has a null value in JSON.');
        assert(json.containsKey(r'url'),
            'Required key "PostMedia[url]" is missing from JSON.');
        assert(json[r'url'] != null,
            'Required key "PostMedia[url]" has a null value in JSON.');
        assert(json.containsKey(r'expiresAt'),
            'Required key "PostMedia[expiresAt]" is missing from JSON.');
        assert(json[r'expiresAt'] != null,
            'Required key "PostMedia[expiresAt]" has a null value in JSON.');
        return true;
      }());

      return PostMedia(
        id: mapValueOfType<String>(json, r'id')!,
        contentType: PostMediaContentType.fromJson(json[r'contentType'])!,
        order: mapValueOfType<int>(json, r'order')!,
        url: mapValueOfType<String>(json, r'url')!,
        expiresAt: mapDateTime(json, r'expiresAt', r'')!,
      );
    }
    return null;
  }

  static List<PostMedia> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostMedia>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostMedia.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PostMedia> mapFromJson(dynamic json) {
    final map = <String, PostMedia>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PostMedia.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PostMedia-objects as value to a dart map
  static Map<String, List<PostMedia>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PostMedia>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PostMedia.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'contentType',
    'order',
    'url',
    'expiresAt',
  };
}

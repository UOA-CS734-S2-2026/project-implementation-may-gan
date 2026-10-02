//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PostLikesPage {
  /// Returns a new [PostLikesPage] instance.
  PostLikesPage({
    this.items = const [],
    required this.nextCursor,
    required this.hasMore,
  });

  final List<PostLike> items;

  final String? nextCursor;

  final bool hasMore;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PostLikesPage &&
          _deepEquality.equals(other.items, items) &&
          other.nextCursor == nextCursor &&
          other.hasMore == hasMore;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (items.hashCode) +
      (nextCursor == null ? 0 : nextCursor!.hashCode) +
      (hasMore.hashCode);

  @override
  String toString() =>
      'PostLikesPage[items=$items, nextCursor=$nextCursor, hasMore=$hasMore]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'items'] = this.items;
    if (this.nextCursor != null) {
      json[r'nextCursor'] = this.nextCursor;
    } else {
      json[r'nextCursor'] = null;
    }
    json[r'hasMore'] = this.hasMore;
    return json;
  }

  /// Clones this instance of [PostLikesPage] and returns a new one where some of the
  /// properties have changed.
  PostLikesPage copyWith({
    List<PostLike>? items,
    String? nextCursor,
    bool nextCursorSetToNull = false,
    bool? hasMore,
  }) =>
      PostLikesPage(
        items: items ?? this.items,
        nextCursor: nextCursorSetToNull ? null : nextCursor ?? this.nextCursor,
        hasMore: hasMore ?? this.hasMore,
      );

  /// Returns a new [PostLikesPage] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PostLikesPage? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'items'),
            'Required key "PostLikesPage[items]" is missing from JSON.');
        assert(json[r'items'] != null,
            'Required key "PostLikesPage[items]" has a null value in JSON.');
        assert(json.containsKey(r'nextCursor'),
            'Required key "PostLikesPage[nextCursor]" is missing from JSON.');
        assert(json.containsKey(r'hasMore'),
            'Required key "PostLikesPage[hasMore]" is missing from JSON.');
        assert(json[r'hasMore'] != null,
            'Required key "PostLikesPage[hasMore]" has a null value in JSON.');
        return true;
      }());

      return PostLikesPage(
        items: PostLike.listFromJson(json[r'items']),
        nextCursor: mapValueOfType<String>(json, r'nextCursor'),
        hasMore: mapValueOfType<bool>(json, r'hasMore')!,
      );
    }
    return null;
  }

  static List<PostLikesPage> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostLikesPage>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostLikesPage.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PostLikesPage> mapFromJson(dynamic json) {
    final map = <String, PostLikesPage>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PostLikesPage.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PostLikesPage-objects as value to a dart map
  static Map<String, List<PostLikesPage>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PostLikesPage>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PostLikesPage.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'items',
    'nextCursor',
    'hasMore',
  };
}

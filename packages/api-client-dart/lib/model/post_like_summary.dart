//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PostLikeSummary {
  /// Returns a new [PostLikeSummary] instance.
  PostLikeSummary({
    required this.likeCount,
    required this.viewerHasLiked,
  });

  /// Minimum value: 0
  final int likeCount;

  final bool viewerHasLiked;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PostLikeSummary &&
          other.likeCount == likeCount &&
          other.viewerHasLiked == viewerHasLiked;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (likeCount.hashCode) + (viewerHasLiked.hashCode);

  @override
  String toString() =>
      'PostLikeSummary[likeCount=$likeCount, viewerHasLiked=$viewerHasLiked]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'likeCount'] = this.likeCount;
    json[r'viewerHasLiked'] = this.viewerHasLiked;
    return json;
  }

  /// Clones this instance of [PostLikeSummary] and returns a new one where some of the
  /// properties have changed.
  PostLikeSummary copyWith({
    int? likeCount,
    bool? viewerHasLiked,
  }) =>
      PostLikeSummary(
        likeCount: likeCount ?? this.likeCount,
        viewerHasLiked: viewerHasLiked ?? this.viewerHasLiked,
      );

  /// Returns a new [PostLikeSummary] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PostLikeSummary? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'likeCount'),
            'Required key "PostLikeSummary[likeCount]" is missing from JSON.');
        assert(json[r'likeCount'] != null,
            'Required key "PostLikeSummary[likeCount]" has a null value in JSON.');
        assert(json.containsKey(r'viewerHasLiked'),
            'Required key "PostLikeSummary[viewerHasLiked]" is missing from JSON.');
        assert(json[r'viewerHasLiked'] != null,
            'Required key "PostLikeSummary[viewerHasLiked]" has a null value in JSON.');
        return true;
      }());

      return PostLikeSummary(
        likeCount: mapValueOfType<int>(json, r'likeCount')!,
        viewerHasLiked: mapValueOfType<bool>(json, r'viewerHasLiked')!,
      );
    }
    return null;
  }

  static List<PostLikeSummary> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostLikeSummary>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostLikeSummary.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PostLikeSummary> mapFromJson(dynamic json) {
    final map = <String, PostLikeSummary>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PostLikeSummary.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PostLikeSummary-objects as value to a dart map
  static Map<String, List<PostLikeSummary>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PostLikeSummary>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PostLikeSummary.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'likeCount',
    'viewerHasLiked',
  };
}

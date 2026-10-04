//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PostRevision {
  /// Returns a new [PostRevision] instance.
  PostRevision({
    required this.revisionNumber,
    required this.reflectiveAnswer,
    required this.caption,
    required this.rating,
    required this.audience,
    required this.replacedAt,
  });

  /// 1 is the version first posted.
  ///
  /// Minimum value: 1
  final int revisionNumber;

  final String reflectiveAnswer;

  final String? caption;

  final int rating;

  final PostAudience audience;

  final DateTime replacedAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PostRevision &&
          other.revisionNumber == revisionNumber &&
          other.reflectiveAnswer == reflectiveAnswer &&
          other.caption == caption &&
          other.rating == rating &&
          other.audience == audience &&
          other.replacedAt == replacedAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (revisionNumber.hashCode) +
      (reflectiveAnswer.hashCode) +
      (caption == null ? 0 : caption!.hashCode) +
      (rating.hashCode) +
      (audience.hashCode) +
      (replacedAt.hashCode);

  @override
  String toString() =>
      'PostRevision[revisionNumber=$revisionNumber, reflectiveAnswer=$reflectiveAnswer, caption=$caption, rating=$rating, audience=$audience, replacedAt=$replacedAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'revisionNumber'] = this.revisionNumber;
    json[r'reflectiveAnswer'] = this.reflectiveAnswer;
    if (this.caption != null) {
      json[r'caption'] = this.caption;
    } else {
      json[r'caption'] = null;
    }
    json[r'rating'] = this.rating;
    json[r'audience'] = this.audience;
    json[r'replacedAt'] = this.replacedAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [PostRevision] and returns a new one where some of the
  /// properties have changed.
  PostRevision copyWith({
    int? revisionNumber,
    String? reflectiveAnswer,
    String? caption,
    bool captionSetToNull = false,
    int? rating,
    PostAudience? audience,
    DateTime? replacedAt,
  }) =>
      PostRevision(
        revisionNumber: revisionNumber ?? this.revisionNumber,
        reflectiveAnswer: reflectiveAnswer ?? this.reflectiveAnswer,
        caption: captionSetToNull ? null : caption ?? this.caption,
        rating: rating ?? this.rating,
        audience: audience ?? this.audience,
        replacedAt: replacedAt ?? this.replacedAt,
      );

  /// Returns a new [PostRevision] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PostRevision? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'revisionNumber'),
            'Required key "PostRevision[revisionNumber]" is missing from JSON.');
        assert(json[r'revisionNumber'] != null,
            'Required key "PostRevision[revisionNumber]" has a null value in JSON.');
        assert(json.containsKey(r'reflectiveAnswer'),
            'Required key "PostRevision[reflectiveAnswer]" is missing from JSON.');
        assert(json[r'reflectiveAnswer'] != null,
            'Required key "PostRevision[reflectiveAnswer]" has a null value in JSON.');
        assert(json.containsKey(r'caption'),
            'Required key "PostRevision[caption]" is missing from JSON.');
        assert(json.containsKey(r'rating'),
            'Required key "PostRevision[rating]" is missing from JSON.');
        assert(json[r'rating'] != null,
            'Required key "PostRevision[rating]" has a null value in JSON.');
        assert(json.containsKey(r'audience'),
            'Required key "PostRevision[audience]" is missing from JSON.');
        assert(json[r'audience'] != null,
            'Required key "PostRevision[audience]" has a null value in JSON.');
        assert(json.containsKey(r'replacedAt'),
            'Required key "PostRevision[replacedAt]" is missing from JSON.');
        assert(json[r'replacedAt'] != null,
            'Required key "PostRevision[replacedAt]" has a null value in JSON.');
        return true;
      }());

      return PostRevision(
        revisionNumber: mapValueOfType<int>(json, r'revisionNumber')!,
        reflectiveAnswer: mapValueOfType<String>(json, r'reflectiveAnswer')!,
        caption: mapValueOfType<String>(json, r'caption'),
        rating: mapValueOfType<int>(json, r'rating')!,
        audience: PostAudience.fromJson(json[r'audience'])!,
        replacedAt: mapDateTime(json, r'replacedAt', r'')!,
      );
    }
    return null;
  }

  static List<PostRevision> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostRevision>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostRevision.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PostRevision> mapFromJson(dynamic json) {
    final map = <String, PostRevision>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PostRevision.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PostRevision-objects as value to a dart map
  static Map<String, List<PostRevision>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PostRevision>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PostRevision.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'revisionNumber',
    'reflectiveAnswer',
    'caption',
    'rating',
    'audience',
    'replacedAt',
  };
}

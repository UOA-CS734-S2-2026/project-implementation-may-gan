//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PostLike {
  /// Returns a new [PostLike] instance.
  PostLike({
    required this.person,
    required this.likedAt,
  });

  final InteractionPerson person;

  final DateTime likedAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PostLike && other.person == person && other.likedAt == likedAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (person.hashCode) + (likedAt.hashCode);

  @override
  String toString() => 'PostLike[person=$person, likedAt=$likedAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'person'] = this.person;
    json[r'likedAt'] = this.likedAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [PostLike] and returns a new one where some of the
  /// properties have changed.
  PostLike copyWith({
    InteractionPerson? person,
    DateTime? likedAt,
  }) =>
      PostLike(
        person: person ?? this.person,
        likedAt: likedAt ?? this.likedAt,
      );

  /// Returns a new [PostLike] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PostLike? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'person'),
            'Required key "PostLike[person]" is missing from JSON.');
        assert(json[r'person'] != null,
            'Required key "PostLike[person]" has a null value in JSON.');
        assert(json.containsKey(r'likedAt'),
            'Required key "PostLike[likedAt]" is missing from JSON.');
        assert(json[r'likedAt'] != null,
            'Required key "PostLike[likedAt]" has a null value in JSON.');
        return true;
      }());

      return PostLike(
        person: InteractionPerson.fromJson(json[r'person'])!,
        likedAt: mapDateTime(json, r'likedAt', r'')!,
      );
    }
    return null;
  }

  static List<PostLike> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostLike>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostLike.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PostLike> mapFromJson(dynamic json) {
    final map = <String, PostLike>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PostLike.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PostLike-objects as value to a dart map
  static Map<String, List<PostLike>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PostLike>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PostLike.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'person',
    'likedAt',
  };
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ProfileStats {
  /// Returns a new [ProfileStats] instance.
  ProfileStats({
    required this.posts,
    required this.friends,
  });

  /// Accepted posts, solo ones included; the streak already reveals which days had one.
  ///
  /// Minimum value: 0
  final int posts;

  /// Minimum value: 0
  final int friends;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ProfileStats && other.posts == posts && other.friends == friends;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (posts.hashCode) + (friends.hashCode);

  @override
  String toString() => 'ProfileStats[posts=$posts, friends=$friends]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'posts'] = this.posts;
    json[r'friends'] = this.friends;
    return json;
  }

  /// Clones this instance of [ProfileStats] and returns a new one where some of the
  /// properties have changed.
  ProfileStats copyWith({
    int? posts,
    int? friends,
  }) =>
      ProfileStats(
        posts: posts ?? this.posts,
        friends: friends ?? this.friends,
      );

  /// Returns a new [ProfileStats] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ProfileStats? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'posts'),
            'Required key "ProfileStats[posts]" is missing from JSON.');
        assert(json[r'posts'] != null,
            'Required key "ProfileStats[posts]" has a null value in JSON.');
        assert(json.containsKey(r'friends'),
            'Required key "ProfileStats[friends]" is missing from JSON.');
        assert(json[r'friends'] != null,
            'Required key "ProfileStats[friends]" has a null value in JSON.');
        return true;
      }());

      return ProfileStats(
        posts: mapValueOfType<int>(json, r'posts')!,
        friends: mapValueOfType<int>(json, r'friends')!,
      );
    }
    return null;
  }

  static List<ProfileStats> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ProfileStats>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ProfileStats.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ProfileStats> mapFromJson(dynamic json) {
    final map = <String, ProfileStats>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ProfileStats.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ProfileStats-objects as value to a dart map
  static Map<String, List<ProfileStats>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ProfileStats>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ProfileStats.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'posts',
    'friends',
  };
}

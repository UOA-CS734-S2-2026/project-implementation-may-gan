//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ProfilePostAuthor {
  /// Returns a new [ProfilePostAuthor] instance.
  ProfilePostAuthor({
    required this.id,
    required this.username,
    required this.displayName,
  });

  final String id;

  final String username;

  final String displayName;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ProfilePostAuthor &&
          other.id == id &&
          other.username == username &&
          other.displayName == displayName;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) + (username.hashCode) + (displayName.hashCode);

  @override
  String toString() =>
      'ProfilePostAuthor[id=$id, username=$username, displayName=$displayName]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'username'] = this.username;
    json[r'displayName'] = this.displayName;
    return json;
  }

  /// Clones this instance of [ProfilePostAuthor] and returns a new one where some of the
  /// properties have changed.
  ProfilePostAuthor copyWith({
    String? id,
    String? username,
    String? displayName,
  }) =>
      ProfilePostAuthor(
        id: id ?? this.id,
        username: username ?? this.username,
        displayName: displayName ?? this.displayName,
      );

  /// Returns a new [ProfilePostAuthor] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ProfilePostAuthor? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "ProfilePostAuthor[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "ProfilePostAuthor[id]" has a null value in JSON.');
        assert(json.containsKey(r'username'),
            'Required key "ProfilePostAuthor[username]" is missing from JSON.');
        assert(json[r'username'] != null,
            'Required key "ProfilePostAuthor[username]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'),
            'Required key "ProfilePostAuthor[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null,
            'Required key "ProfilePostAuthor[displayName]" has a null value in JSON.');
        return true;
      }());

      return ProfilePostAuthor(
        id: mapValueOfType<String>(json, r'id')!,
        username: mapValueOfType<String>(json, r'username')!,
        displayName: mapValueOfType<String>(json, r'displayName')!,
      );
    }
    return null;
  }

  static List<ProfilePostAuthor> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ProfilePostAuthor>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ProfilePostAuthor.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ProfilePostAuthor> mapFromJson(dynamic json) {
    final map = <String, ProfilePostAuthor>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ProfilePostAuthor.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ProfilePostAuthor-objects as value to a dart map
  static Map<String, List<ProfilePostAuthor>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ProfilePostAuthor>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ProfilePostAuthor.listFromJson(
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
    'username',
    'displayName',
  };
}

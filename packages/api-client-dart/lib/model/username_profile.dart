//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UsernameProfile {
  /// Returns a new [UsernameProfile] instance.
  UsernameProfile({
    required this.username,
    required this.publicName,
    required this.needsUsernameSetup,
  });

  final String username;

  final String publicName;

  final bool needsUsernameSetup;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UsernameProfile &&
          other.username == username &&
          other.publicName == publicName &&
          other.needsUsernameSetup == needsUsernameSetup;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (username.hashCode) +
      (publicName.hashCode) +
      (needsUsernameSetup.hashCode);

  @override
  String toString() =>
      'UsernameProfile[username=$username, publicName=$publicName, needsUsernameSetup=$needsUsernameSetup]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'username'] = this.username;
    json[r'publicName'] = this.publicName;
    json[r'needsUsernameSetup'] = this.needsUsernameSetup;
    return json;
  }

  /// Clones this instance of [UsernameProfile] and returns a new one where some of the
  /// properties have changed.
  UsernameProfile copyWith({
    String? username,
    String? publicName,
    bool? needsUsernameSetup,
  }) =>
      UsernameProfile(
        username: username ?? this.username,
        publicName: publicName ?? this.publicName,
        needsUsernameSetup: needsUsernameSetup ?? this.needsUsernameSetup,
      );

  /// Returns a new [UsernameProfile] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UsernameProfile? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'username'),
            'Required key "UsernameProfile[username]" is missing from JSON.');
        assert(json[r'username'] != null,
            'Required key "UsernameProfile[username]" has a null value in JSON.');
        assert(json.containsKey(r'publicName'),
            'Required key "UsernameProfile[publicName]" is missing from JSON.');
        assert(json[r'publicName'] != null,
            'Required key "UsernameProfile[publicName]" has a null value in JSON.');
        assert(json.containsKey(r'needsUsernameSetup'),
            'Required key "UsernameProfile[needsUsernameSetup]" is missing from JSON.');
        assert(json[r'needsUsernameSetup'] != null,
            'Required key "UsernameProfile[needsUsernameSetup]" has a null value in JSON.');
        return true;
      }());

      return UsernameProfile(
        username: mapValueOfType<String>(json, r'username')!,
        publicName: mapValueOfType<String>(json, r'publicName')!,
        needsUsernameSetup: mapValueOfType<bool>(json, r'needsUsernameSetup')!,
      );
    }
    return null;
  }

  static List<UsernameProfile> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <UsernameProfile>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UsernameProfile.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UsernameProfile> mapFromJson(dynamic json) {
    final map = <String, UsernameProfile>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UsernameProfile.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UsernameProfile-objects as value to a dart map
  static Map<String, List<UsernameProfile>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<UsernameProfile>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UsernameProfile.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'username',
    'publicName',
    'needsUsernameSetup',
  };
}

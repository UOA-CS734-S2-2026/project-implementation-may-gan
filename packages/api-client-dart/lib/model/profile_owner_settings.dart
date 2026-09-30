//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ProfileOwnerSettings {
  /// Returns a new [ProfileOwnerSettings] instance.
  ProfileOwnerSettings({
    required this.profileVisibility,
    required this.usernameChangeAvailableAt,
  });

  final ProfileVisibility profileVisibility;

  /// When the username can next change, or null when it can change now.
  final DateTime usernameChangeAvailableAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ProfileOwnerSettings &&
          other.profileVisibility == profileVisibility &&
          other.usernameChangeAvailableAt == usernameChangeAvailableAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (profileVisibility.hashCode) + (usernameChangeAvailableAt.hashCode);

  @override
  String toString() =>
      'ProfileOwnerSettings[profileVisibility=$profileVisibility, usernameChangeAvailableAt=$usernameChangeAvailableAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'profileVisibility'] = this.profileVisibility;
    json[r'usernameChangeAvailableAt'] =
        this.usernameChangeAvailableAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [ProfileOwnerSettings] and returns a new one where some of the
  /// properties have changed.
  ProfileOwnerSettings copyWith({
    ProfileVisibility? profileVisibility,
    DateTime? usernameChangeAvailableAt,
  }) =>
      ProfileOwnerSettings(
        profileVisibility: profileVisibility ?? this.profileVisibility,
        usernameChangeAvailableAt:
            usernameChangeAvailableAt ?? this.usernameChangeAvailableAt,
      );

  /// Returns a new [ProfileOwnerSettings] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ProfileOwnerSettings? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'profileVisibility'),
            'Required key "ProfileOwnerSettings[profileVisibility]" is missing from JSON.');
        assert(json[r'profileVisibility'] != null,
            'Required key "ProfileOwnerSettings[profileVisibility]" has a null value in JSON.');
        assert(json.containsKey(r'usernameChangeAvailableAt'),
            'Required key "ProfileOwnerSettings[usernameChangeAvailableAt]" is missing from JSON.');
        assert(json[r'usernameChangeAvailableAt'] != null,
            'Required key "ProfileOwnerSettings[usernameChangeAvailableAt]" has a null value in JSON.');
        return true;
      }());

      return ProfileOwnerSettings(
        profileVisibility:
            ProfileVisibility.fromJson(json[r'profileVisibility'])!,
        usernameChangeAvailableAt:
            mapDateTime(json, r'usernameChangeAvailableAt', r'')!,
      );
    }
    return null;
  }

  static List<ProfileOwnerSettings> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ProfileOwnerSettings>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ProfileOwnerSettings.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ProfileOwnerSettings> mapFromJson(dynamic json) {
    final map = <String, ProfileOwnerSettings>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ProfileOwnerSettings.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ProfileOwnerSettings-objects as value to a dart map
  static Map<String, List<ProfileOwnerSettings>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ProfileOwnerSettings>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ProfileOwnerSettings.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'profileVisibility',
    'usernameChangeAvailableAt',
  };
}

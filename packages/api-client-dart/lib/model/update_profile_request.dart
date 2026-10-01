//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UpdateProfileRequest {
  /// Returns a new [UpdateProfileRequest] instance.
  UpdateProfileRequest({
    this.bio,
    this.publicName,
    this.profileVisibility,
  });

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? bio;

  /// The name shown instead of the username. Null or blank shows the username.
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? publicName;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final ProfileVisibility? profileVisibility;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UpdateProfileRequest &&
          other.bio == bio &&
          other.publicName == publicName &&
          other.profileVisibility == profileVisibility;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (bio == null ? 0 : bio!.hashCode) +
      (publicName == null ? 0 : publicName!.hashCode) +
      (profileVisibility == null ? 0 : profileVisibility!.hashCode);

  @override
  String toString() =>
      'UpdateProfileRequest[bio=$bio, publicName=$publicName, profileVisibility=$profileVisibility]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.bio != null) {
      json[r'bio'] = this.bio;
    } else {
      json[r'bio'] = null;
    }
    if (this.publicName != null) {
      json[r'publicName'] = this.publicName;
    } else {
      json[r'publicName'] = null;
    }
    if (this.profileVisibility != null) {
      json[r'profileVisibility'] = this.profileVisibility;
    } else {
      json[r'profileVisibility'] = null;
    }
    return json;
  }

  /// Clones this instance of [UpdateProfileRequest] and returns a new one where some of the
  /// properties have changed.
  UpdateProfileRequest copyWith({
    String? bio,
    String? publicName,
    ProfileVisibility? profileVisibility,
  }) =>
      UpdateProfileRequest(
        bio: bio ?? this.bio,
        publicName: publicName ?? this.publicName,
        profileVisibility: profileVisibility ?? this.profileVisibility,
      );

  /// Returns a new [UpdateProfileRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UpdateProfileRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        return true;
      }());

      return UpdateProfileRequest(
        bio: mapValueOfType<String>(json, r'bio'),
        publicName: mapValueOfType<String>(json, r'publicName'),
        profileVisibility:
            ProfileVisibility.fromJson(json[r'profileVisibility']),
      );
    }
    return null;
  }

  static List<UpdateProfileRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <UpdateProfileRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UpdateProfileRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UpdateProfileRequest> mapFromJson(dynamic json) {
    final map = <String, UpdateProfileRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UpdateProfileRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UpdateProfileRequest-objects as value to a dart map
  static Map<String, List<UpdateProfileRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<UpdateProfileRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UpdateProfileRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{};
}

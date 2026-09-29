//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UsernameSetupRequest {
  /// Returns a new [UsernameSetupRequest] instance.
  UsernameSetupRequest({
    required this.username,
    this.publicName,
  });

  final String username;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? publicName;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UsernameSetupRequest &&
          other.username == username &&
          other.publicName == publicName;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (username.hashCode) + (publicName == null ? 0 : publicName!.hashCode);

  @override
  String toString() =>
      'UsernameSetupRequest[username=$username, publicName=$publicName]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'username'] = this.username;
    if (this.publicName != null) {
      json[r'publicName'] = this.publicName;
    } else {
      json[r'publicName'] = null;
    }
    return json;
  }

  /// Clones this instance of [UsernameSetupRequest] and returns a new one where some of the
  /// properties have changed.
  UsernameSetupRequest copyWith({
    String? username,
    String? publicName,
  }) =>
      UsernameSetupRequest(
        username: username ?? this.username,
        publicName: publicName ?? this.publicName,
      );

  /// Returns a new [UsernameSetupRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UsernameSetupRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'username'),
            'Required key "UsernameSetupRequest[username]" is missing from JSON.');
        assert(json[r'username'] != null,
            'Required key "UsernameSetupRequest[username]" has a null value in JSON.');
        return true;
      }());

      return UsernameSetupRequest(
        username: mapValueOfType<String>(json, r'username')!,
        publicName: mapValueOfType<String>(json, r'publicName'),
      );
    }
    return null;
  }

  static List<UsernameSetupRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <UsernameSetupRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UsernameSetupRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UsernameSetupRequest> mapFromJson(dynamic json) {
    final map = <String, UsernameSetupRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UsernameSetupRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UsernameSetupRequest-objects as value to a dart map
  static Map<String, List<UsernameSetupRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<UsernameSetupRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UsernameSetupRequest.listFromJson(
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
  };
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ChangeUsernameResponse {
  /// Returns a new [ChangeUsernameResponse] instance.
  ChangeUsernameResponse({
    required this.username,
    required this.usernameChangeAvailableAt,
  });

  final String username;

  /// When the username can next change, or null when it can change now.
  final DateTime? usernameChangeAvailableAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ChangeUsernameResponse &&
          other.username == username &&
          other.usernameChangeAvailableAt == usernameChangeAvailableAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (username.hashCode) +
      (usernameChangeAvailableAt == null
          ? 0
          : usernameChangeAvailableAt!.hashCode);

  @override
  String toString() =>
      'ChangeUsernameResponse[username=$username, usernameChangeAvailableAt=$usernameChangeAvailableAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'username'] = this.username;
    if (this.usernameChangeAvailableAt != null) {
      json[r'usernameChangeAvailableAt'] =
          this.usernameChangeAvailableAt!.toUtc().toIso8601String();
    } else {
      json[r'usernameChangeAvailableAt'] = null;
    }
    return json;
  }

  /// Clones this instance of [ChangeUsernameResponse] and returns a new one where some of the
  /// properties have changed.
  ChangeUsernameResponse copyWith({
    String? username,
    DateTime? usernameChangeAvailableAt,
    bool usernameChangeAvailableAtSetToNull = false,
  }) =>
      ChangeUsernameResponse(
        username: username ?? this.username,
        usernameChangeAvailableAt: usernameChangeAvailableAtSetToNull
            ? null
            : usernameChangeAvailableAt ?? this.usernameChangeAvailableAt,
      );

  /// Returns a new [ChangeUsernameResponse] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ChangeUsernameResponse? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'username'),
            'Required key "ChangeUsernameResponse[username]" is missing from JSON.');
        assert(json[r'username'] != null,
            'Required key "ChangeUsernameResponse[username]" has a null value in JSON.');
        assert(json.containsKey(r'usernameChangeAvailableAt'),
            'Required key "ChangeUsernameResponse[usernameChangeAvailableAt]" is missing from JSON.');
        return true;
      }());

      return ChangeUsernameResponse(
        username: mapValueOfType<String>(json, r'username')!,
        usernameChangeAvailableAt:
            mapDateTime(json, r'usernameChangeAvailableAt', r''),
      );
    }
    return null;
  }

  static List<ChangeUsernameResponse> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ChangeUsernameResponse>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChangeUsernameResponse.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ChangeUsernameResponse> mapFromJson(dynamic json) {
    final map = <String, ChangeUsernameResponse>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ChangeUsernameResponse.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ChangeUsernameResponse-objects as value to a dart map
  static Map<String, List<ChangeUsernameResponse>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ChangeUsernameResponse>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ChangeUsernameResponse.listFromJson(
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
    'usernameChangeAvailableAt',
  };
}

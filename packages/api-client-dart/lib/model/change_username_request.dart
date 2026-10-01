//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ChangeUsernameRequest {
  /// Returns a new [ChangeUsernameRequest] instance.
  ChangeUsernameRequest({
    required this.username,
  });

  final String username;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ChangeUsernameRequest && other.username == username;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (username.hashCode);

  @override
  String toString() => 'ChangeUsernameRequest[username=$username]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'username'] = this.username;
    return json;
  }

  /// Clones this instance of [ChangeUsernameRequest] and returns a new one where some of the
  /// properties have changed.
  ChangeUsernameRequest copyWith({
    String? username,
  }) =>
      ChangeUsernameRequest(
        username: username ?? this.username,
      );

  /// Returns a new [ChangeUsernameRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ChangeUsernameRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'username'),
            'Required key "ChangeUsernameRequest[username]" is missing from JSON.');
        assert(json[r'username'] != null,
            'Required key "ChangeUsernameRequest[username]" has a null value in JSON.');
        return true;
      }());

      return ChangeUsernameRequest(
        username: mapValueOfType<String>(json, r'username')!,
      );
    }
    return null;
  }

  static List<ChangeUsernameRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ChangeUsernameRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ChangeUsernameRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ChangeUsernameRequest> mapFromJson(dynamic json) {
    final map = <String, ChangeUsernameRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ChangeUsernameRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ChangeUsernameRequest-objects as value to a dart map
  static Map<String, List<ChangeUsernameRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ChangeUsernameRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ChangeUsernameRequest.listFromJson(
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

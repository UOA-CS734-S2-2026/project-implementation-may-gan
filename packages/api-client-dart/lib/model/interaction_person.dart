//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class InteractionPerson {
  /// Returns a new [InteractionPerson] instance.
  InteractionPerson({
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
      other is InteractionPerson &&
          other.id == id &&
          other.username == username &&
          other.displayName == displayName;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) + (username.hashCode) + (displayName.hashCode);

  @override
  String toString() =>
      'InteractionPerson[id=$id, username=$username, displayName=$displayName]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'username'] = this.username;
    json[r'displayName'] = this.displayName;
    return json;
  }

  /// Clones this instance of [InteractionPerson] and returns a new one where some of the
  /// properties have changed.
  InteractionPerson copyWith({
    String? id,
    String? username,
    String? displayName,
  }) =>
      InteractionPerson(
        id: id ?? this.id,
        username: username ?? this.username,
        displayName: displayName ?? this.displayName,
      );

  /// Returns a new [InteractionPerson] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static InteractionPerson? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "InteractionPerson[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "InteractionPerson[id]" has a null value in JSON.');
        assert(json.containsKey(r'username'),
            'Required key "InteractionPerson[username]" is missing from JSON.');
        assert(json[r'username'] != null,
            'Required key "InteractionPerson[username]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'),
            'Required key "InteractionPerson[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null,
            'Required key "InteractionPerson[displayName]" has a null value in JSON.');
        return true;
      }());

      return InteractionPerson(
        id: mapValueOfType<String>(json, r'id')!,
        username: mapValueOfType<String>(json, r'username')!,
        displayName: mapValueOfType<String>(json, r'displayName')!,
      );
    }
    return null;
  }

  static List<InteractionPerson> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <InteractionPerson>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = InteractionPerson.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, InteractionPerson> mapFromJson(dynamic json) {
    final map = <String, InteractionPerson>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = InteractionPerson.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of InteractionPerson-objects as value to a dart map
  static Map<String, List<InteractionPerson>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<InteractionPerson>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = InteractionPerson.listFromJson(
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

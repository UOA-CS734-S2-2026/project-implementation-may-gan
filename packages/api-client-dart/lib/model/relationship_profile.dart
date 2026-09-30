//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RelationshipProfile {
  /// Returns a new [RelationshipProfile] instance.
  RelationshipProfile({
    required this.id,
    required this.username,
    required this.displayName,
    required this.relationship,
  });

  final String id;

  final String username;

  final String displayName;

  final RelationshipState relationship;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RelationshipProfile &&
          other.id == id &&
          other.username == username &&
          other.displayName == displayName &&
          other.relationship == relationship;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (username.hashCode) +
      (displayName.hashCode) +
      (relationship.hashCode);

  @override
  String toString() =>
      'RelationshipProfile[id=$id, username=$username, displayName=$displayName, relationship=$relationship]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'username'] = this.username;
    json[r'displayName'] = this.displayName;
    json[r'relationship'] = this.relationship;
    return json;
  }

  /// Clones this instance of [RelationshipProfile] and returns a new one where some of the
  /// properties have changed.
  RelationshipProfile copyWith({
    String? id,
    String? username,
    String? displayName,
    RelationshipState? relationship,
  }) =>
      RelationshipProfile(
        id: id ?? this.id,
        username: username ?? this.username,
        displayName: displayName ?? this.displayName,
        relationship: relationship ?? this.relationship,
      );

  /// Returns a new [RelationshipProfile] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RelationshipProfile? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "RelationshipProfile[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "RelationshipProfile[id]" has a null value in JSON.');
        assert(json.containsKey(r'username'),
            'Required key "RelationshipProfile[username]" is missing from JSON.');
        assert(json[r'username'] != null,
            'Required key "RelationshipProfile[username]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'),
            'Required key "RelationshipProfile[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null,
            'Required key "RelationshipProfile[displayName]" has a null value in JSON.');
        assert(json.containsKey(r'relationship'),
            'Required key "RelationshipProfile[relationship]" is missing from JSON.');
        assert(json[r'relationship'] != null,
            'Required key "RelationshipProfile[relationship]" has a null value in JSON.');
        return true;
      }());

      return RelationshipProfile(
        id: mapValueOfType<String>(json, r'id')!,
        username: mapValueOfType<String>(json, r'username')!,
        displayName: mapValueOfType<String>(json, r'displayName')!,
        relationship: RelationshipState.fromJson(json[r'relationship'])!,
      );
    }
    return null;
  }

  static List<RelationshipProfile> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <RelationshipProfile>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RelationshipProfile.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RelationshipProfile> mapFromJson(dynamic json) {
    final map = <String, RelationshipProfile>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RelationshipProfile.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RelationshipProfile-objects as value to a dart map
  static Map<String, List<RelationshipProfile>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<RelationshipProfile>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RelationshipProfile.listFromJson(
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
    'relationship',
  };
}

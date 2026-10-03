//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RestrictedProfile {
  /// Returns a new [RestrictedProfile] instance.
  RestrictedProfile({
    required this.kind,
    required this.username,
  });

  final RestrictedProfileKindEnum kind;

  final String username;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RestrictedProfile &&
          other.kind == kind &&
          other.username == username;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (kind.hashCode) + (username.hashCode);

  @override
  String toString() => 'RestrictedProfile[kind=$kind, username=$username]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'kind'] = this.kind;
    json[r'username'] = this.username;
    return json;
  }

  /// Clones this instance of [RestrictedProfile] and returns a new one where some of the
  /// properties have changed.
  RestrictedProfile copyWith({
    RestrictedProfileKindEnum? kind,
    String? username,
  }) =>
      RestrictedProfile(
        kind: kind ?? this.kind,
        username: username ?? this.username,
      );

  /// Returns a new [RestrictedProfile] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RestrictedProfile? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'),
            'Required key "RestrictedProfile[kind]" is missing from JSON.');
        assert(json[r'kind'] != null,
            'Required key "RestrictedProfile[kind]" has a null value in JSON.');
        assert(json.containsKey(r'username'),
            'Required key "RestrictedProfile[username]" is missing from JSON.');
        assert(json[r'username'] != null,
            'Required key "RestrictedProfile[username]" has a null value in JSON.');
        return true;
      }());

      return RestrictedProfile(
        kind: RestrictedProfileKindEnum.fromJson(json[r'kind'])!,
        username: mapValueOfType<String>(json, r'username')!,
      );
    }
    return null;
  }

  static List<RestrictedProfile> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <RestrictedProfile>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RestrictedProfile.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RestrictedProfile> mapFromJson(dynamic json) {
    final map = <String, RestrictedProfile>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RestrictedProfile.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RestrictedProfile-objects as value to a dart map
  static Map<String, List<RestrictedProfile>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<RestrictedProfile>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RestrictedProfile.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'kind',
    'username',
  };
}

enum RestrictedProfileKindEnum {
  restricted._(r'restricted'),
  ;

  /// Instantiate a new enum with the provided value.
  const RestrictedProfileKindEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [RestrictedProfileKindEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static RestrictedProfileKindEnum? fromJson(dynamic value) =>
      RestrictedProfileKindEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [RestrictedProfileKindEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<RestrictedProfileKindEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <RestrictedProfileKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RestrictedProfileKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [RestrictedProfileKindEnum] to String,
/// and [decode] dynamic data back to [RestrictedProfileKindEnum].
class RestrictedProfileKindEnumTypeTransformer {
  factory RestrictedProfileKindEnumTypeTransformer() =>
      _instance ??= const RestrictedProfileKindEnumTypeTransformer._();

  const RestrictedProfileKindEnumTypeTransformer._();

  String encode(RestrictedProfileKindEnum data) => data._value;

  /// Returns the instance of [RestrictedProfileKindEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  RestrictedProfileKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is RestrictedProfileKindEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'restricted':
          return RestrictedProfileKindEnum.restricted;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static RestrictedProfileKindEnumTypeTransformer? _instance;
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PublicProfile {
  /// Returns a new [PublicProfile] instance.
  PublicProfile({
    required this.kind,
    required this.username,
    required this.displayName,
    required this.bio,
    required this.avatarUrl,
    required this.streak,
  });

  final PublicProfileKindEnum kind;

  final String username;

  final String displayName;

  final String? bio;

  /// The parent-authorized Worker avatar route when a current avatar exists, otherwise null.
  final String? avatarUrl;

  final PostingStreak? streak;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PublicProfile &&
          other.kind == kind &&
          other.username == username &&
          other.displayName == displayName &&
          other.bio == bio &&
          other.avatarUrl == avatarUrl &&
          other.streak == streak;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (kind.hashCode) +
      (username.hashCode) +
      (displayName.hashCode) +
      (bio == null ? 0 : bio!.hashCode) +
      (avatarUrl == null ? 0 : avatarUrl!.hashCode) +
      (streak == null ? 0 : streak!.hashCode);

  @override
  String toString() =>
      'PublicProfile[kind=$kind, username=$username, displayName=$displayName, bio=$bio, avatarUrl=$avatarUrl, streak=$streak]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'kind'] = this.kind;
    json[r'username'] = this.username;
    json[r'displayName'] = this.displayName;
    if (this.bio != null) {
      json[r'bio'] = this.bio;
    } else {
      json[r'bio'] = null;
    }
    if (this.avatarUrl != null) {
      json[r'avatarUrl'] = this.avatarUrl;
    } else {
      json[r'avatarUrl'] = null;
    }
    if (this.streak != null) {
      json[r'streak'] = this.streak;
    } else {
      json[r'streak'] = null;
    }
    return json;
  }

  /// Clones this instance of [PublicProfile] and returns a new one where some of the
  /// properties have changed.
  PublicProfile copyWith({
    PublicProfileKindEnum? kind,
    String? username,
    String? displayName,
    String? bio,
    bool bioSetToNull = false,
    String? avatarUrl,
    bool avatarUrlSetToNull = false,
    PostingStreak? streak,
    bool streakSetToNull = false,
  }) =>
      PublicProfile(
        kind: kind ?? this.kind,
        username: username ?? this.username,
        displayName: displayName ?? this.displayName,
        bio: bioSetToNull ? null : bio ?? this.bio,
        avatarUrl: avatarUrlSetToNull ? null : avatarUrl ?? this.avatarUrl,
        streak: streakSetToNull ? null : streak ?? this.streak,
      );

  /// Returns a new [PublicProfile] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PublicProfile? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'),
            'Required key "PublicProfile[kind]" is missing from JSON.');
        assert(json[r'kind'] != null,
            'Required key "PublicProfile[kind]" has a null value in JSON.');
        assert(json.containsKey(r'username'),
            'Required key "PublicProfile[username]" is missing from JSON.');
        assert(json[r'username'] != null,
            'Required key "PublicProfile[username]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'),
            'Required key "PublicProfile[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null,
            'Required key "PublicProfile[displayName]" has a null value in JSON.');
        assert(json.containsKey(r'bio'),
            'Required key "PublicProfile[bio]" is missing from JSON.');
        assert(json.containsKey(r'avatarUrl'),
            'Required key "PublicProfile[avatarUrl]" is missing from JSON.');
        assert(json.containsKey(r'streak'),
            'Required key "PublicProfile[streak]" is missing from JSON.');
        return true;
      }());

      return PublicProfile(
        kind: PublicProfileKindEnum.fromJson(json[r'kind'])!,
        username: mapValueOfType<String>(json, r'username')!,
        displayName: mapValueOfType<String>(json, r'displayName')!,
        bio: mapValueOfType<String>(json, r'bio'),
        avatarUrl: mapValueOfType<String>(json, r'avatarUrl'),
        streak: PostingStreak.fromJson(json[r'streak']),
      );
    }
    return null;
  }

  static List<PublicProfile> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PublicProfile>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PublicProfile.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PublicProfile> mapFromJson(dynamic json) {
    final map = <String, PublicProfile>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PublicProfile.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PublicProfile-objects as value to a dart map
  static Map<String, List<PublicProfile>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PublicProfile>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PublicProfile.listFromJson(
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
    'displayName',
    'bio',
    'avatarUrl',
    'streak',
  };
}

enum PublicProfileKindEnum {
  public._(r'public'),
  ;

  /// Instantiate a new enum with the provided value.
  const PublicProfileKindEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [PublicProfileKindEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static PublicProfileKindEnum? fromJson(dynamic value) =>
      PublicProfileKindEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [PublicProfileKindEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<PublicProfileKindEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PublicProfileKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PublicProfileKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [PublicProfileKindEnum] to String,
/// and [decode] dynamic data back to [PublicProfileKindEnum].
class PublicProfileKindEnumTypeTransformer {
  factory PublicProfileKindEnumTypeTransformer() =>
      _instance ??= const PublicProfileKindEnumTypeTransformer._();

  const PublicProfileKindEnumTypeTransformer._();

  String encode(PublicProfileKindEnum data) => data._value;

  /// Returns the instance of [PublicProfileKindEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  PublicProfileKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is PublicProfileKindEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'public':
          return PublicProfileKindEnum.public;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static PublicProfileKindEnumTypeTransformer? _instance;
}

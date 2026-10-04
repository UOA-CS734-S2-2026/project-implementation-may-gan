//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ReadableProfile {
  /// Returns a new [ReadableProfile] instance.
  ReadableProfile({
    required this.kind,
    required this.username,
    this.id,
    this.displayName,
    this.detailsVisible,
    this.bio,
    this.mbti,
    this.whatIDo,
    this.listeningTo,
    this.avatarUrl,
    this.streak,
    this.stats,
    this.owner,
  });

  final ReadableProfileKindEnum kind;

  final String username;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? id;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? displayName;

  /// False when the account is private and the caller is not an active friend. The bio is then null.
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final bool? detailsVisible;

  final String? bio;

  final Mbti? mbti;

  /// Null when unset or when the bio is hidden.
  final String? whatIDo;

  /// Null when unset or when the bio is hidden.
  final String? listeningTo;

  /// A link to the profile photo that expires after 10 minutes. Null when there is no photo or the bio is hidden.
  final String? avatarUrl;

  final PostingStreak? streak;

  final ProfileStats? stats;

  final ProfileOwnerSettings? owner;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ReadableProfile &&
          other.kind == kind &&
          other.username == username &&
          other.id == id &&
          other.displayName == displayName &&
          other.detailsVisible == detailsVisible &&
          other.bio == bio &&
          other.mbti == mbti &&
          other.whatIDo == whatIDo &&
          other.listeningTo == listeningTo &&
          other.avatarUrl == avatarUrl &&
          other.streak == streak &&
          other.stats == stats &&
          other.owner == owner;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (kind.hashCode) +
      (username.hashCode) +
      (id == null ? 0 : id!.hashCode) +
      (displayName == null ? 0 : displayName!.hashCode) +
      (detailsVisible == null ? 0 : detailsVisible!.hashCode) +
      (bio == null ? 0 : bio!.hashCode) +
      (mbti == null ? 0 : mbti!.hashCode) +
      (whatIDo == null ? 0 : whatIDo!.hashCode) +
      (listeningTo == null ? 0 : listeningTo!.hashCode) +
      (avatarUrl == null ? 0 : avatarUrl!.hashCode) +
      (streak == null ? 0 : streak!.hashCode) +
      (stats == null ? 0 : stats!.hashCode) +
      (owner == null ? 0 : owner!.hashCode);

  @override
  String toString() =>
      'ReadableProfile[kind=$kind, username=$username, id=$id, displayName=$displayName, detailsVisible=$detailsVisible, bio=$bio, mbti=$mbti, whatIDo=$whatIDo, listeningTo=$listeningTo, avatarUrl=$avatarUrl, streak=$streak, stats=$stats, owner=$owner]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'kind'] = this.kind;
    json[r'username'] = this.username;
    if (this.id != null) {
      json[r'id'] = this.id;
    } else {
      json[r'id'] = null;
    }
    if (this.displayName != null) {
      json[r'displayName'] = this.displayName;
    } else {
      json[r'displayName'] = null;
    }
    if (this.detailsVisible != null) {
      json[r'detailsVisible'] = this.detailsVisible;
    } else {
      json[r'detailsVisible'] = null;
    }
    if (this.bio != null) {
      json[r'bio'] = this.bio;
    } else {
      json[r'bio'] = null;
    }
    if (this.mbti != null) {
      json[r'mbti'] = this.mbti;
    } else {
      json[r'mbti'] = null;
    }
    if (this.whatIDo != null) {
      json[r'whatIDo'] = this.whatIDo;
    } else {
      json[r'whatIDo'] = null;
    }
    if (this.listeningTo != null) {
      json[r'listeningTo'] = this.listeningTo;
    } else {
      json[r'listeningTo'] = null;
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
    if (this.stats != null) {
      json[r'stats'] = this.stats;
    } else {
      json[r'stats'] = null;
    }
    if (this.owner != null) {
      json[r'owner'] = this.owner;
    } else {
      json[r'owner'] = null;
    }
    return json;
  }

  /// Clones this instance of [ReadableProfile] and returns a new one where some of the
  /// properties have changed.
  ReadableProfile copyWith({
    ReadableProfileKindEnum? kind,
    String? username,
    String? id,
    String? displayName,
    bool? detailsVisible,
    String? bio,
    bool bioSetToNull = false,
    Mbti? mbti,
    bool mbtiSetToNull = false,
    String? whatIDo,
    bool whatIDoSetToNull = false,
    String? listeningTo,
    bool listeningToSetToNull = false,
    String? avatarUrl,
    bool avatarUrlSetToNull = false,
    PostingStreak? streak,
    bool streakSetToNull = false,
    ProfileStats? stats,
    bool statsSetToNull = false,
    ProfileOwnerSettings? owner,
    bool ownerSetToNull = false,
  }) =>
      ReadableProfile(
        kind: kind ?? this.kind,
        username: username ?? this.username,
        id: id ?? this.id,
        displayName: displayName ?? this.displayName,
        detailsVisible: detailsVisible ?? this.detailsVisible,
        bio: bioSetToNull ? null : bio ?? this.bio,
        mbti: mbtiSetToNull ? null : mbti ?? this.mbti,
        whatIDo: whatIDoSetToNull ? null : whatIDo ?? this.whatIDo,
        listeningTo:
            listeningToSetToNull ? null : listeningTo ?? this.listeningTo,
        avatarUrl: avatarUrlSetToNull ? null : avatarUrl ?? this.avatarUrl,
        streak: streakSetToNull ? null : streak ?? this.streak,
        stats: statsSetToNull ? null : stats ?? this.stats,
        owner: ownerSetToNull ? null : owner ?? this.owner,
      );

  /// Returns a new [ReadableProfile] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ReadableProfile? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'),
            'Required key "ReadableProfile[kind]" is missing from JSON.');
        assert(json[r'kind'] != null,
            'Required key "ReadableProfile[kind]" has a null value in JSON.');
        assert(json.containsKey(r'username'),
            'Required key "ReadableProfile[username]" is missing from JSON.');
        assert(json[r'username'] != null,
            'Required key "ReadableProfile[username]" has a null value in JSON.');
        return true;
      }());

      return ReadableProfile(
        kind: ReadableProfileKindEnum.fromJson(json[r'kind'])!,
        username: mapValueOfType<String>(json, r'username')!,
        id: mapValueOfType<String>(json, r'id'),
        displayName: mapValueOfType<String>(json, r'displayName'),
        detailsVisible: mapValueOfType<bool>(json, r'detailsVisible'),
        bio: mapValueOfType<String>(json, r'bio'),
        mbti: Mbti.fromJson(json[r'mbti']),
        whatIDo: mapValueOfType<String>(json, r'whatIDo'),
        listeningTo: mapValueOfType<String>(json, r'listeningTo'),
        avatarUrl: mapValueOfType<String>(json, r'avatarUrl'),
        streak: PostingStreak.fromJson(json[r'streak']),
        stats: ProfileStats.fromJson(json[r'stats']),
        owner: ProfileOwnerSettings.fromJson(json[r'owner']),
      );
    }
    return null;
  }

  static List<ReadableProfile> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ReadableProfile>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReadableProfile.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ReadableProfile> mapFromJson(dynamic json) {
    final map = <String, ReadableProfile>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ReadableProfile.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ReadableProfile-objects as value to a dart map
  static Map<String, List<ReadableProfile>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ReadableProfile>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ReadableProfile.listFromJson(
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

enum ReadableProfileKindEnum {
  authorized._(r'authorized'),
  public._(r'public'),
  restricted._(r'restricted'),
  ;

  /// Instantiate a new enum with the provided value.
  const ReadableProfileKindEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [ReadableProfileKindEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static ReadableProfileKindEnum? fromJson(dynamic value) =>
      ReadableProfileKindEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [ReadableProfileKindEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<ReadableProfileKindEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ReadableProfileKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReadableProfileKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ReadableProfileKindEnum] to String,
/// and [decode] dynamic data back to [ReadableProfileKindEnum].
class ReadableProfileKindEnumTypeTransformer {
  factory ReadableProfileKindEnumTypeTransformer() =>
      _instance ??= const ReadableProfileKindEnumTypeTransformer._();

  const ReadableProfileKindEnumTypeTransformer._();

  String encode(ReadableProfileKindEnum data) => data._value;

  /// Returns the instance of [ReadableProfileKindEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ReadableProfileKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is ReadableProfileKindEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'authorized':
          return ReadableProfileKindEnum.authorized;
        case r'public':
          return ReadableProfileKindEnum.public;
        case r'restricted':
          return ReadableProfileKindEnum.restricted;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static ReadableProfileKindEnumTypeTransformer? _instance;
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ProfileDetails {
  /// Returns a new [ProfileDetails] instance.
  ProfileDetails({
    required this.id,
    required this.username,
    required this.displayName,
    required this.detailsVisible,
    required this.bio,
    required this.mbti,
    required this.whatIDo,
    required this.listeningTo,
    required this.avatarUrl,
    required this.streak,
    required this.stats,
    required this.owner,
  });

  final String id;

  /// The current handle. It differs from the requested one when that was a handle the owner has since changed.
  final String username;

  final String displayName;

  /// False when the account is private and the caller is not an active friend. The bio is then null.
  final bool detailsVisible;

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
      other is ProfileDetails &&
          other.id == id &&
          other.username == username &&
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
      (id.hashCode) +
      (username.hashCode) +
      (displayName.hashCode) +
      (detailsVisible.hashCode) +
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
      'ProfileDetails[id=$id, username=$username, displayName=$displayName, detailsVisible=$detailsVisible, bio=$bio, mbti=$mbti, whatIDo=$whatIDo, listeningTo=$listeningTo, avatarUrl=$avatarUrl, streak=$streak, stats=$stats, owner=$owner]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'username'] = this.username;
    json[r'displayName'] = this.displayName;
    json[r'detailsVisible'] = this.detailsVisible;
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

  /// Clones this instance of [ProfileDetails] and returns a new one where some of the
  /// properties have changed.
  ProfileDetails copyWith({
    String? id,
    String? username,
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
      ProfileDetails(
        id: id ?? this.id,
        username: username ?? this.username,
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

  /// Returns a new [ProfileDetails] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ProfileDetails? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "ProfileDetails[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "ProfileDetails[id]" has a null value in JSON.');
        assert(json.containsKey(r'username'),
            'Required key "ProfileDetails[username]" is missing from JSON.');
        assert(json[r'username'] != null,
            'Required key "ProfileDetails[username]" has a null value in JSON.');
        assert(json.containsKey(r'displayName'),
            'Required key "ProfileDetails[displayName]" is missing from JSON.');
        assert(json[r'displayName'] != null,
            'Required key "ProfileDetails[displayName]" has a null value in JSON.');
        assert(json.containsKey(r'detailsVisible'),
            'Required key "ProfileDetails[detailsVisible]" is missing from JSON.');
        assert(json[r'detailsVisible'] != null,
            'Required key "ProfileDetails[detailsVisible]" has a null value in JSON.');
        assert(json.containsKey(r'bio'),
            'Required key "ProfileDetails[bio]" is missing from JSON.');
        assert(json.containsKey(r'mbti'),
            'Required key "ProfileDetails[mbti]" is missing from JSON.');
        assert(json.containsKey(r'whatIDo'),
            'Required key "ProfileDetails[whatIDo]" is missing from JSON.');
        assert(json.containsKey(r'listeningTo'),
            'Required key "ProfileDetails[listeningTo]" is missing from JSON.');
        assert(json.containsKey(r'avatarUrl'),
            'Required key "ProfileDetails[avatarUrl]" is missing from JSON.');
        assert(json.containsKey(r'streak'),
            'Required key "ProfileDetails[streak]" is missing from JSON.');
        assert(json.containsKey(r'stats'),
            'Required key "ProfileDetails[stats]" is missing from JSON.');
        assert(json.containsKey(r'owner'),
            'Required key "ProfileDetails[owner]" is missing from JSON.');
        return true;
      }());

      return ProfileDetails(
        id: mapValueOfType<String>(json, r'id')!,
        username: mapValueOfType<String>(json, r'username')!,
        displayName: mapValueOfType<String>(json, r'displayName')!,
        detailsVisible: mapValueOfType<bool>(json, r'detailsVisible')!,
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

  static List<ProfileDetails> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ProfileDetails>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ProfileDetails.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ProfileDetails> mapFromJson(dynamic json) {
    final map = <String, ProfileDetails>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ProfileDetails.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ProfileDetails-objects as value to a dart map
  static Map<String, List<ProfileDetails>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ProfileDetails>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ProfileDetails.listFromJson(
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
    'detailsVisible',
    'bio',
    'mbti',
    'whatIDo',
    'listeningTo',
    'avatarUrl',
    'streak',
    'stats',
    'owner',
  };
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ProfilePost {
  /// Returns a new [ProfilePost] instance.
  ProfilePost({
    required this.id,
    required this.author,
    required this.localDate,
    required this.prompt,
    required this.reflectiveAnswer,
    required this.caption,
    required this.rating,
    required this.audience,
    required this.acceptedAt,
    required this.releasedAt,
    required this.released,
    required this.edited,
    this.media = const [],
  });

  final String id;

  final ProfilePostAuthor author;

  final String localDate;

  final ProfilePostPrompt prompt;

  final String reflectiveAnswer;

  final String? caption;

  final int rating;

  /// `solo` appears only on the caller's own profile.
  final ProfilePostAudienceEnum audience;

  final DateTime acceptedAt;

  final DateTime releasedAt;

  /// False only on the caller's own profile, for a post whose day has not been released yet.
  final bool released;

  /// True when the author has edited the post since it was accepted.
  final bool edited;

  /// Attached photos or video in display order, each with a private download URL that expires after 5 minutes.
  final List<PostMedia> media;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ProfilePost &&
          other.id == id &&
          other.author == author &&
          other.localDate == localDate &&
          other.prompt == prompt &&
          other.reflectiveAnswer == reflectiveAnswer &&
          other.caption == caption &&
          other.rating == rating &&
          other.audience == audience &&
          other.acceptedAt == acceptedAt &&
          other.releasedAt == releasedAt &&
          other.released == released &&
          other.edited == edited &&
          _deepEquality.equals(other.media, media);

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (author.hashCode) +
      (localDate.hashCode) +
      (prompt.hashCode) +
      (reflectiveAnswer.hashCode) +
      (caption == null ? 0 : caption!.hashCode) +
      (rating.hashCode) +
      (audience.hashCode) +
      (acceptedAt.hashCode) +
      (releasedAt.hashCode) +
      (released.hashCode) +
      (edited.hashCode) +
      (media.hashCode);

  @override
  String toString() =>
      'ProfilePost[id=$id, author=$author, localDate=$localDate, prompt=$prompt, reflectiveAnswer=$reflectiveAnswer, caption=$caption, rating=$rating, audience=$audience, acceptedAt=$acceptedAt, releasedAt=$releasedAt, released=$released, edited=$edited, media=$media]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'author'] = this.author;
    json[r'localDate'] = this.localDate;
    json[r'prompt'] = this.prompt;
    json[r'reflectiveAnswer'] = this.reflectiveAnswer;
    if (this.caption != null) {
      json[r'caption'] = this.caption;
    } else {
      json[r'caption'] = null;
    }
    json[r'rating'] = this.rating;
    json[r'audience'] = this.audience;
    json[r'acceptedAt'] = this.acceptedAt.toUtc().toIso8601String();
    json[r'releasedAt'] = this.releasedAt.toUtc().toIso8601String();
    json[r'released'] = this.released;
    json[r'edited'] = this.edited;
    json[r'media'] = this.media;
    return json;
  }

  /// Clones this instance of [ProfilePost] and returns a new one where some of the
  /// properties have changed.
  ProfilePost copyWith({
    String? id,
    ProfilePostAuthor? author,
    String? localDate,
    ProfilePostPrompt? prompt,
    String? reflectiveAnswer,
    String? caption,
    bool captionSetToNull = false,
    int? rating,
    ProfilePostAudienceEnum? audience,
    DateTime? acceptedAt,
    DateTime? releasedAt,
    bool? released,
    bool? edited,
    List<PostMedia>? media,
  }) =>
      ProfilePost(
        id: id ?? this.id,
        author: author ?? this.author,
        localDate: localDate ?? this.localDate,
        prompt: prompt ?? this.prompt,
        reflectiveAnswer: reflectiveAnswer ?? this.reflectiveAnswer,
        caption: captionSetToNull ? null : caption ?? this.caption,
        rating: rating ?? this.rating,
        audience: audience ?? this.audience,
        acceptedAt: acceptedAt ?? this.acceptedAt,
        releasedAt: releasedAt ?? this.releasedAt,
        released: released ?? this.released,
        edited: edited ?? this.edited,
        media: media ?? this.media,
      );

  /// Returns a new [ProfilePost] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ProfilePost? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "ProfilePost[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "ProfilePost[id]" has a null value in JSON.');
        assert(json.containsKey(r'author'),
            'Required key "ProfilePost[author]" is missing from JSON.');
        assert(json[r'author'] != null,
            'Required key "ProfilePost[author]" has a null value in JSON.');
        assert(json.containsKey(r'localDate'),
            'Required key "ProfilePost[localDate]" is missing from JSON.');
        assert(json[r'localDate'] != null,
            'Required key "ProfilePost[localDate]" has a null value in JSON.');
        assert(json.containsKey(r'prompt'),
            'Required key "ProfilePost[prompt]" is missing from JSON.');
        assert(json[r'prompt'] != null,
            'Required key "ProfilePost[prompt]" has a null value in JSON.');
        assert(json.containsKey(r'reflectiveAnswer'),
            'Required key "ProfilePost[reflectiveAnswer]" is missing from JSON.');
        assert(json[r'reflectiveAnswer'] != null,
            'Required key "ProfilePost[reflectiveAnswer]" has a null value in JSON.');
        assert(json.containsKey(r'caption'),
            'Required key "ProfilePost[caption]" is missing from JSON.');
        assert(json.containsKey(r'rating'),
            'Required key "ProfilePost[rating]" is missing from JSON.');
        assert(json[r'rating'] != null,
            'Required key "ProfilePost[rating]" has a null value in JSON.');
        assert(json.containsKey(r'audience'),
            'Required key "ProfilePost[audience]" is missing from JSON.');
        assert(json[r'audience'] != null,
            'Required key "ProfilePost[audience]" has a null value in JSON.');
        assert(json.containsKey(r'acceptedAt'),
            'Required key "ProfilePost[acceptedAt]" is missing from JSON.');
        assert(json[r'acceptedAt'] != null,
            'Required key "ProfilePost[acceptedAt]" has a null value in JSON.');
        assert(json.containsKey(r'releasedAt'),
            'Required key "ProfilePost[releasedAt]" is missing from JSON.');
        assert(json[r'releasedAt'] != null,
            'Required key "ProfilePost[releasedAt]" has a null value in JSON.');
        assert(json.containsKey(r'released'),
            'Required key "ProfilePost[released]" is missing from JSON.');
        assert(json[r'released'] != null,
            'Required key "ProfilePost[released]" has a null value in JSON.');
        assert(json.containsKey(r'edited'),
            'Required key "ProfilePost[edited]" is missing from JSON.');
        assert(json[r'edited'] != null,
            'Required key "ProfilePost[edited]" has a null value in JSON.');
        assert(json.containsKey(r'media'),
            'Required key "ProfilePost[media]" is missing from JSON.');
        assert(json[r'media'] != null,
            'Required key "ProfilePost[media]" has a null value in JSON.');
        return true;
      }());

      return ProfilePost(
        id: mapValueOfType<String>(json, r'id')!,
        author: ProfilePostAuthor.fromJson(json[r'author'])!,
        localDate: mapValueOfType<String>(json, r'localDate')!,
        prompt: ProfilePostPrompt.fromJson(json[r'prompt'])!,
        reflectiveAnswer: mapValueOfType<String>(json, r'reflectiveAnswer')!,
        caption: mapValueOfType<String>(json, r'caption'),
        rating: mapValueOfType<int>(json, r'rating')!,
        audience: ProfilePostAudienceEnum.fromJson(json[r'audience'])!,
        acceptedAt: mapDateTime(json, r'acceptedAt', r'')!,
        releasedAt: mapDateTime(json, r'releasedAt', r'')!,
        released: mapValueOfType<bool>(json, r'released')!,
        edited: mapValueOfType<bool>(json, r'edited')!,
        media: PostMedia.listFromJson(json[r'media']),
      );
    }
    return null;
  }

  static List<ProfilePost> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ProfilePost>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ProfilePost.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ProfilePost> mapFromJson(dynamic json) {
    final map = <String, ProfilePost>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ProfilePost.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ProfilePost-objects as value to a dart map
  static Map<String, List<ProfilePost>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ProfilePost>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ProfilePost.listFromJson(
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
    'author',
    'localDate',
    'prompt',
    'reflectiveAnswer',
    'caption',
    'rating',
    'audience',
    'acceptedAt',
    'releasedAt',
    'released',
    'edited',
    'media',
  };
}

/// `solo` appears only on the caller's own profile.
enum ProfilePostAudienceEnum {
  solo._(r'solo'),
  friends._(r'friends'),
  ;

  /// Instantiate a new enum with the provided value.
  const ProfilePostAudienceEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [ProfilePostAudienceEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static ProfilePostAudienceEnum? fromJson(dynamic value) =>
      ProfilePostAudienceEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [ProfilePostAudienceEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<ProfilePostAudienceEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ProfilePostAudienceEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ProfilePostAudienceEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ProfilePostAudienceEnum] to String,
/// and [decode] dynamic data back to [ProfilePostAudienceEnum].
class ProfilePostAudienceEnumTypeTransformer {
  factory ProfilePostAudienceEnumTypeTransformer() =>
      _instance ??= const ProfilePostAudienceEnumTypeTransformer._();

  const ProfilePostAudienceEnumTypeTransformer._();

  String encode(ProfilePostAudienceEnum data) => data._value;

  /// Returns the instance of [ProfilePostAudienceEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ProfilePostAudienceEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is ProfilePostAudienceEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'solo':
          return ProfilePostAudienceEnum.solo;
        case r'friends':
          return ProfilePostAudienceEnum.friends;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static ProfilePostAudienceEnumTypeTransformer? _instance;
}

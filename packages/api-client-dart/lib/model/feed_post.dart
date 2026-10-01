//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FeedPost {
  /// Returns a new [FeedPost] instance.
  FeedPost({
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
    required this.edited,
    this.media = const [],
  });

  final String id;

  final FeedPostAuthor author;

  final String localDate;

  final FeedPostPrompt prompt;

  final String reflectiveAnswer;

  final String caption;

  final int rating;

  /// Always `friends`: solo posts never appear in another user's feed.
  final FeedPostAudienceEnum audience;

  final DateTime acceptedAt;

  final DateTime releasedAt;

  /// True when the author has edited the post since it was accepted.
  final bool edited;

  /// Attached photos or video in display order, each with a private download URL that expires after 5 minutes.
  final List<PostMedia> media;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is FeedPost &&
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
      (caption.hashCode) +
      (rating.hashCode) +
      (audience.hashCode) +
      (acceptedAt.hashCode) +
      (releasedAt.hashCode) +
      (edited.hashCode) +
      (media.hashCode);

  @override
  String toString() =>
      'FeedPost[id=$id, author=$author, localDate=$localDate, prompt=$prompt, reflectiveAnswer=$reflectiveAnswer, caption=$caption, rating=$rating, audience=$audience, acceptedAt=$acceptedAt, releasedAt=$releasedAt, edited=$edited, media=$media]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'author'] = this.author;
    json[r'localDate'] = this.localDate;
    json[r'prompt'] = this.prompt;
    json[r'reflectiveAnswer'] = this.reflectiveAnswer;
    json[r'caption'] = this.caption;
    json[r'rating'] = this.rating;
    json[r'audience'] = this.audience;
    json[r'acceptedAt'] = this.acceptedAt.toUtc().toIso8601String();
    json[r'releasedAt'] = this.releasedAt.toUtc().toIso8601String();
    json[r'edited'] = this.edited;
    json[r'media'] = this.media;
    return json;
  }

  /// Clones this instance of [FeedPost] and returns a new one where some of the
  /// properties have changed.
  FeedPost copyWith({
    String? id,
    FeedPostAuthor? author,
    String? localDate,
    FeedPostPrompt? prompt,
    String? reflectiveAnswer,
    String? caption,
    int? rating,
    FeedPostAudienceEnum? audience,
    DateTime? acceptedAt,
    DateTime? releasedAt,
    bool? edited,
    List<PostMedia>? media,
  }) =>
      FeedPost(
        id: id ?? this.id,
        author: author ?? this.author,
        localDate: localDate ?? this.localDate,
        prompt: prompt ?? this.prompt,
        reflectiveAnswer: reflectiveAnswer ?? this.reflectiveAnswer,
        caption: caption ?? this.caption,
        rating: rating ?? this.rating,
        audience: audience ?? this.audience,
        acceptedAt: acceptedAt ?? this.acceptedAt,
        releasedAt: releasedAt ?? this.releasedAt,
        edited: edited ?? this.edited,
        media: media ?? this.media,
      );

  /// Returns a new [FeedPost] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FeedPost? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "FeedPost[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "FeedPost[id]" has a null value in JSON.');
        assert(json.containsKey(r'author'),
            'Required key "FeedPost[author]" is missing from JSON.');
        assert(json[r'author'] != null,
            'Required key "FeedPost[author]" has a null value in JSON.');
        assert(json.containsKey(r'localDate'),
            'Required key "FeedPost[localDate]" is missing from JSON.');
        assert(json[r'localDate'] != null,
            'Required key "FeedPost[localDate]" has a null value in JSON.');
        assert(json.containsKey(r'prompt'),
            'Required key "FeedPost[prompt]" is missing from JSON.');
        assert(json[r'prompt'] != null,
            'Required key "FeedPost[prompt]" has a null value in JSON.');
        assert(json.containsKey(r'reflectiveAnswer'),
            'Required key "FeedPost[reflectiveAnswer]" is missing from JSON.');
        assert(json[r'reflectiveAnswer'] != null,
            'Required key "FeedPost[reflectiveAnswer]" has a null value in JSON.');
        assert(json.containsKey(r'caption'),
            'Required key "FeedPost[caption]" is missing from JSON.');
        assert(json[r'caption'] != null,
            'Required key "FeedPost[caption]" has a null value in JSON.');
        assert(json.containsKey(r'rating'),
            'Required key "FeedPost[rating]" is missing from JSON.');
        assert(json[r'rating'] != null,
            'Required key "FeedPost[rating]" has a null value in JSON.');
        assert(json.containsKey(r'audience'),
            'Required key "FeedPost[audience]" is missing from JSON.');
        assert(json[r'audience'] != null,
            'Required key "FeedPost[audience]" has a null value in JSON.');
        assert(json.containsKey(r'acceptedAt'),
            'Required key "FeedPost[acceptedAt]" is missing from JSON.');
        assert(json[r'acceptedAt'] != null,
            'Required key "FeedPost[acceptedAt]" has a null value in JSON.');
        assert(json.containsKey(r'releasedAt'),
            'Required key "FeedPost[releasedAt]" is missing from JSON.');
        assert(json[r'releasedAt'] != null,
            'Required key "FeedPost[releasedAt]" has a null value in JSON.');
        assert(json.containsKey(r'edited'),
            'Required key "FeedPost[edited]" is missing from JSON.');
        assert(json[r'edited'] != null,
            'Required key "FeedPost[edited]" has a null value in JSON.');
        assert(json.containsKey(r'media'),
            'Required key "FeedPost[media]" is missing from JSON.');
        assert(json[r'media'] != null,
            'Required key "FeedPost[media]" has a null value in JSON.');
        return true;
      }());

      return FeedPost(
        id: mapValueOfType<String>(json, r'id')!,
        author: FeedPostAuthor.fromJson(json[r'author'])!,
        localDate: mapValueOfType<String>(json, r'localDate')!,
        prompt: FeedPostPrompt.fromJson(json[r'prompt'])!,
        reflectiveAnswer: mapValueOfType<String>(json, r'reflectiveAnswer')!,
        caption: mapValueOfType<String>(json, r'caption')!,
        rating: mapValueOfType<int>(json, r'rating')!,
        audience: FeedPostAudienceEnum.fromJson(json[r'audience'])!,
        acceptedAt: mapDateTime(json, r'acceptedAt', r'')!,
        releasedAt: mapDateTime(json, r'releasedAt', r'')!,
        edited: mapValueOfType<bool>(json, r'edited')!,
        media: PostMedia.listFromJson(json[r'media']),
      );
    }
    return null;
  }

  static List<FeedPost> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <FeedPost>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FeedPost.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FeedPost> mapFromJson(dynamic json) {
    final map = <String, FeedPost>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FeedPost.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FeedPost-objects as value to a dart map
  static Map<String, List<FeedPost>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<FeedPost>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FeedPost.listFromJson(
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
    'edited',
    'media',
  };
}

/// Always `friends`: solo posts never appear in another user's feed.
enum FeedPostAudienceEnum {
  friends._(r'friends'),
  ;

  /// Instantiate a new enum with the provided value.
  const FeedPostAudienceEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [FeedPostAudienceEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static FeedPostAudienceEnum? fromJson(dynamic value) =>
      FeedPostAudienceEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [FeedPostAudienceEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<FeedPostAudienceEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <FeedPostAudienceEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FeedPostAudienceEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [FeedPostAudienceEnum] to String,
/// and [decode] dynamic data back to [FeedPostAudienceEnum].
class FeedPostAudienceEnumTypeTransformer {
  factory FeedPostAudienceEnumTypeTransformer() =>
      _instance ??= const FeedPostAudienceEnumTypeTransformer._();

  const FeedPostAudienceEnumTypeTransformer._();

  String encode(FeedPostAudienceEnum data) => data._value;

  /// Returns the instance of [FeedPostAudienceEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  FeedPostAudienceEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is FeedPostAudienceEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'friends':
          return FeedPostAudienceEnum.friends;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static FeedPostAudienceEnumTypeTransformer? _instance;
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PostDetail {
  /// Returns a new [PostDetail] instance.
  PostDetail({
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
    required this.revisionCount,
    required this.viewerIsAuthor,
    this.media = const [],
    required this.voiceMemo,
  });

  final String id;

  final PostDetailAuthor author;

  final String localDate;

  final PostDetailPrompt prompt;

  final String reflectiveAnswer;

  final String? caption;

  final int rating;

  final PostDetailAudienceEnum audience;

  final DateTime acceptedAt;

  final DateTime releasedAt;

  /// True when the caller can read an earlier version of the post.
  final bool edited;

  /// Earlier versions the caller can read. The author sees every saved edit and sends this as `expectedRevisionCount` when editing. Anyone else sees only versions that were already shared with friends.
  ///
  /// Minimum value: 0
  final int revisionCount;

  final bool viewerIsAuthor;

  /// Attached photos or video in display order, each with a private download URL that expires after 5 minutes.
  final List<PostMedia> media;

  /// The post's voice memo with a private download URL that expires after 5 minutes, or null when the post has none. Only post detail carries it; feeds and profile lists do not.
  final PostVoiceMemo? voiceMemo;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PostDetail &&
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
          other.revisionCount == revisionCount &&
          other.viewerIsAuthor == viewerIsAuthor &&
          _deepEquality.equals(other.media, media) &&
          other.voiceMemo == voiceMemo;

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
      (edited.hashCode) +
      (revisionCount.hashCode) +
      (viewerIsAuthor.hashCode) +
      (media.hashCode) +
      (voiceMemo == null ? 0 : voiceMemo!.hashCode);

  @override
  String toString() =>
      'PostDetail[id=$id, author=$author, localDate=$localDate, prompt=$prompt, reflectiveAnswer=$reflectiveAnswer, caption=$caption, rating=$rating, audience=$audience, acceptedAt=$acceptedAt, releasedAt=$releasedAt, edited=$edited, revisionCount=$revisionCount, viewerIsAuthor=$viewerIsAuthor, media=$media, voiceMemo=$voiceMemo]';

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
    json[r'edited'] = this.edited;
    json[r'revisionCount'] = this.revisionCount;
    json[r'viewerIsAuthor'] = this.viewerIsAuthor;
    json[r'media'] = this.media;
    if (this.voiceMemo != null) {
      json[r'voiceMemo'] = this.voiceMemo;
    } else {
      json[r'voiceMemo'] = null;
    }
    return json;
  }

  /// Clones this instance of [PostDetail] and returns a new one where some of the
  /// properties have changed.
  PostDetail copyWith({
    String? id,
    PostDetailAuthor? author,
    String? localDate,
    PostDetailPrompt? prompt,
    String? reflectiveAnswer,
    String? caption,
    bool captionSetToNull = false,
    int? rating,
    PostDetailAudienceEnum? audience,
    DateTime? acceptedAt,
    DateTime? releasedAt,
    bool? edited,
    int? revisionCount,
    bool? viewerIsAuthor,
    List<PostMedia>? media,
    PostVoiceMemo? voiceMemo,
    bool voiceMemoSetToNull = false,
  }) =>
      PostDetail(
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
        edited: edited ?? this.edited,
        revisionCount: revisionCount ?? this.revisionCount,
        viewerIsAuthor: viewerIsAuthor ?? this.viewerIsAuthor,
        media: media ?? this.media,
        voiceMemo: voiceMemoSetToNull ? null : voiceMemo ?? this.voiceMemo,
      );

  /// Returns a new [PostDetail] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PostDetail? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "PostDetail[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "PostDetail[id]" has a null value in JSON.');
        assert(json.containsKey(r'author'),
            'Required key "PostDetail[author]" is missing from JSON.');
        assert(json[r'author'] != null,
            'Required key "PostDetail[author]" has a null value in JSON.');
        assert(json.containsKey(r'localDate'),
            'Required key "PostDetail[localDate]" is missing from JSON.');
        assert(json[r'localDate'] != null,
            'Required key "PostDetail[localDate]" has a null value in JSON.');
        assert(json.containsKey(r'prompt'),
            'Required key "PostDetail[prompt]" is missing from JSON.');
        assert(json[r'prompt'] != null,
            'Required key "PostDetail[prompt]" has a null value in JSON.');
        assert(json.containsKey(r'reflectiveAnswer'),
            'Required key "PostDetail[reflectiveAnswer]" is missing from JSON.');
        assert(json[r'reflectiveAnswer'] != null,
            'Required key "PostDetail[reflectiveAnswer]" has a null value in JSON.');
        assert(json.containsKey(r'caption'),
            'Required key "PostDetail[caption]" is missing from JSON.');
        assert(json.containsKey(r'rating'),
            'Required key "PostDetail[rating]" is missing from JSON.');
        assert(json[r'rating'] != null,
            'Required key "PostDetail[rating]" has a null value in JSON.');
        assert(json.containsKey(r'audience'),
            'Required key "PostDetail[audience]" is missing from JSON.');
        assert(json[r'audience'] != null,
            'Required key "PostDetail[audience]" has a null value in JSON.');
        assert(json.containsKey(r'acceptedAt'),
            'Required key "PostDetail[acceptedAt]" is missing from JSON.');
        assert(json[r'acceptedAt'] != null,
            'Required key "PostDetail[acceptedAt]" has a null value in JSON.');
        assert(json.containsKey(r'releasedAt'),
            'Required key "PostDetail[releasedAt]" is missing from JSON.');
        assert(json[r'releasedAt'] != null,
            'Required key "PostDetail[releasedAt]" has a null value in JSON.');
        assert(json.containsKey(r'edited'),
            'Required key "PostDetail[edited]" is missing from JSON.');
        assert(json[r'edited'] != null,
            'Required key "PostDetail[edited]" has a null value in JSON.');
        assert(json.containsKey(r'revisionCount'),
            'Required key "PostDetail[revisionCount]" is missing from JSON.');
        assert(json[r'revisionCount'] != null,
            'Required key "PostDetail[revisionCount]" has a null value in JSON.');
        assert(json.containsKey(r'viewerIsAuthor'),
            'Required key "PostDetail[viewerIsAuthor]" is missing from JSON.');
        assert(json[r'viewerIsAuthor'] != null,
            'Required key "PostDetail[viewerIsAuthor]" has a null value in JSON.');
        assert(json.containsKey(r'media'),
            'Required key "PostDetail[media]" is missing from JSON.');
        assert(json[r'media'] != null,
            'Required key "PostDetail[media]" has a null value in JSON.');
        assert(json.containsKey(r'voiceMemo'),
            'Required key "PostDetail[voiceMemo]" is missing from JSON.');
        return true;
      }());

      return PostDetail(
        id: mapValueOfType<String>(json, r'id')!,
        author: PostDetailAuthor.fromJson(json[r'author'])!,
        localDate: mapValueOfType<String>(json, r'localDate')!,
        prompt: PostDetailPrompt.fromJson(json[r'prompt'])!,
        reflectiveAnswer: mapValueOfType<String>(json, r'reflectiveAnswer')!,
        caption: mapValueOfType<String>(json, r'caption'),
        rating: mapValueOfType<int>(json, r'rating')!,
        audience: PostDetailAudienceEnum.fromJson(json[r'audience'])!,
        acceptedAt: mapDateTime(json, r'acceptedAt', r'')!,
        releasedAt: mapDateTime(json, r'releasedAt', r'')!,
        edited: mapValueOfType<bool>(json, r'edited')!,
        revisionCount: mapValueOfType<int>(json, r'revisionCount')!,
        viewerIsAuthor: mapValueOfType<bool>(json, r'viewerIsAuthor')!,
        media: PostMedia.listFromJson(json[r'media']),
        voiceMemo: PostVoiceMemo.fromJson(json[r'voiceMemo']),
      );
    }
    return null;
  }

  static List<PostDetail> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostDetail>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostDetail.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PostDetail> mapFromJson(dynamic json) {
    final map = <String, PostDetail>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PostDetail.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PostDetail-objects as value to a dart map
  static Map<String, List<PostDetail>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PostDetail>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PostDetail.listFromJson(
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
    'revisionCount',
    'viewerIsAuthor',
    'media',
    'voiceMemo',
  };
}

enum PostDetailAudienceEnum {
  solo._(r'solo'),
  friends._(r'friends'),
  ;

  /// Instantiate a new enum with the provided value.
  const PostDetailAudienceEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [PostDetailAudienceEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static PostDetailAudienceEnum? fromJson(dynamic value) =>
      PostDetailAudienceEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [PostDetailAudienceEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<PostDetailAudienceEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostDetailAudienceEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostDetailAudienceEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [PostDetailAudienceEnum] to String,
/// and [decode] dynamic data back to [PostDetailAudienceEnum].
class PostDetailAudienceEnumTypeTransformer {
  factory PostDetailAudienceEnumTypeTransformer() =>
      _instance ??= const PostDetailAudienceEnumTypeTransformer._();

  const PostDetailAudienceEnumTypeTransformer._();

  String encode(PostDetailAudienceEnum data) => data._value;

  /// Returns the instance of [PostDetailAudienceEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  PostDetailAudienceEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is PostDetailAudienceEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'solo':
          return PostDetailAudienceEnum.solo;
        case r'friends':
          return PostDetailAudienceEnum.friends;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static PostDetailAudienceEnumTypeTransformer? _instance;
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class DailyPost {
  /// Returns a new [DailyPost] instance.
  DailyPost({
    required this.id,
    required this.authorId,
    required this.localDate,
    required this.prompt,
    required this.reflectiveAnswer,
    required this.caption,
    required this.rating,
    required this.audience,
    required this.acceptedAt,
    required this.releasedAt,
    required this.tomorrowNote,
    this.media = const [],
    required this.voiceMemo,
  });

  final String id;

  final String authorId;

  final String localDate;

  final DailyPostPrompt prompt;

  final String reflectiveAnswer;

  final String caption;

  final int rating;

  final PostAudience audience;

  final DateTime acceptedAt;

  final DateTime releasedAt;

  final DailyPostTomorrowNote tomorrowNote;

  /// The attached photos or video in display order. Empty for a text-only post.
  final List<DailyPostMedia> media;

  /// The attached voice memo, or null when the post has none.
  final DailyPostVoiceMemo? voiceMemo;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DailyPost &&
          other.id == id &&
          other.authorId == authorId &&
          other.localDate == localDate &&
          other.prompt == prompt &&
          other.reflectiveAnswer == reflectiveAnswer &&
          other.caption == caption &&
          other.rating == rating &&
          other.audience == audience &&
          other.acceptedAt == acceptedAt &&
          other.releasedAt == releasedAt &&
          other.tomorrowNote == tomorrowNote &&
          _deepEquality.equals(other.media, media) &&
          other.voiceMemo == voiceMemo;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (authorId.hashCode) +
      (localDate.hashCode) +
      (prompt.hashCode) +
      (reflectiveAnswer.hashCode) +
      (caption.hashCode) +
      (rating.hashCode) +
      (audience.hashCode) +
      (acceptedAt.hashCode) +
      (releasedAt.hashCode) +
      (tomorrowNote.hashCode) +
      (media.hashCode) +
      (voiceMemo == null ? 0 : voiceMemo!.hashCode);

  @override
  String toString() =>
      'DailyPost[id=$id, authorId=$authorId, localDate=$localDate, prompt=$prompt, reflectiveAnswer=$reflectiveAnswer, caption=$caption, rating=$rating, audience=$audience, acceptedAt=$acceptedAt, releasedAt=$releasedAt, tomorrowNote=$tomorrowNote, media=$media, voiceMemo=$voiceMemo]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'authorId'] = this.authorId;
    json[r'localDate'] = this.localDate;
    json[r'prompt'] = this.prompt;
    json[r'reflectiveAnswer'] = this.reflectiveAnswer;
    json[r'caption'] = this.caption;
    json[r'rating'] = this.rating;
    json[r'audience'] = this.audience;
    json[r'acceptedAt'] = this.acceptedAt.toUtc().toIso8601String();
    json[r'releasedAt'] = this.releasedAt.toUtc().toIso8601String();
    json[r'tomorrowNote'] = this.tomorrowNote;
    json[r'media'] = this.media;
    if (this.voiceMemo != null) {
      json[r'voiceMemo'] = this.voiceMemo;
    } else {
      json[r'voiceMemo'] = null;
    }
    return json;
  }

  /// Clones this instance of [DailyPost] and returns a new one where some of the
  /// properties have changed.
  DailyPost copyWith({
    String? id,
    String? authorId,
    String? localDate,
    DailyPostPrompt? prompt,
    String? reflectiveAnswer,
    String? caption,
    int? rating,
    PostAudience? audience,
    DateTime? acceptedAt,
    DateTime? releasedAt,
    DailyPostTomorrowNote? tomorrowNote,
    List<DailyPostMedia>? media,
    DailyPostVoiceMemo? voiceMemo,
    bool voiceMemoSetToNull = false,
  }) =>
      DailyPost(
        id: id ?? this.id,
        authorId: authorId ?? this.authorId,
        localDate: localDate ?? this.localDate,
        prompt: prompt ?? this.prompt,
        reflectiveAnswer: reflectiveAnswer ?? this.reflectiveAnswer,
        caption: caption ?? this.caption,
        rating: rating ?? this.rating,
        audience: audience ?? this.audience,
        acceptedAt: acceptedAt ?? this.acceptedAt,
        releasedAt: releasedAt ?? this.releasedAt,
        tomorrowNote: tomorrowNote ?? this.tomorrowNote,
        media: media ?? this.media,
        voiceMemo: voiceMemoSetToNull ? null : voiceMemo ?? this.voiceMemo,
      );

  /// Returns a new [DailyPost] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static DailyPost? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "DailyPost[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "DailyPost[id]" has a null value in JSON.');
        assert(json.containsKey(r'authorId'),
            'Required key "DailyPost[authorId]" is missing from JSON.');
        assert(json[r'authorId'] != null,
            'Required key "DailyPost[authorId]" has a null value in JSON.');
        assert(json.containsKey(r'localDate'),
            'Required key "DailyPost[localDate]" is missing from JSON.');
        assert(json[r'localDate'] != null,
            'Required key "DailyPost[localDate]" has a null value in JSON.');
        assert(json.containsKey(r'prompt'),
            'Required key "DailyPost[prompt]" is missing from JSON.');
        assert(json[r'prompt'] != null,
            'Required key "DailyPost[prompt]" has a null value in JSON.');
        assert(json.containsKey(r'reflectiveAnswer'),
            'Required key "DailyPost[reflectiveAnswer]" is missing from JSON.');
        assert(json[r'reflectiveAnswer'] != null,
            'Required key "DailyPost[reflectiveAnswer]" has a null value in JSON.');
        assert(json.containsKey(r'caption'),
            'Required key "DailyPost[caption]" is missing from JSON.');
        assert(json[r'caption'] != null,
            'Required key "DailyPost[caption]" has a null value in JSON.');
        assert(json.containsKey(r'rating'),
            'Required key "DailyPost[rating]" is missing from JSON.');
        assert(json[r'rating'] != null,
            'Required key "DailyPost[rating]" has a null value in JSON.');
        assert(json.containsKey(r'audience'),
            'Required key "DailyPost[audience]" is missing from JSON.');
        assert(json[r'audience'] != null,
            'Required key "DailyPost[audience]" has a null value in JSON.');
        assert(json.containsKey(r'acceptedAt'),
            'Required key "DailyPost[acceptedAt]" is missing from JSON.');
        assert(json[r'acceptedAt'] != null,
            'Required key "DailyPost[acceptedAt]" has a null value in JSON.');
        assert(json.containsKey(r'releasedAt'),
            'Required key "DailyPost[releasedAt]" is missing from JSON.');
        assert(json[r'releasedAt'] != null,
            'Required key "DailyPost[releasedAt]" has a null value in JSON.');
        assert(json.containsKey(r'tomorrowNote'),
            'Required key "DailyPost[tomorrowNote]" is missing from JSON.');
        assert(json[r'tomorrowNote'] != null,
            'Required key "DailyPost[tomorrowNote]" has a null value in JSON.');
        assert(json.containsKey(r'media'),
            'Required key "DailyPost[media]" is missing from JSON.');
        assert(json[r'media'] != null,
            'Required key "DailyPost[media]" has a null value in JSON.');
        assert(json.containsKey(r'voiceMemo'),
            'Required key "DailyPost[voiceMemo]" is missing from JSON.');
        return true;
      }());

      return DailyPost(
        id: mapValueOfType<String>(json, r'id')!,
        authorId: mapValueOfType<String>(json, r'authorId')!,
        localDate: mapValueOfType<String>(json, r'localDate')!,
        prompt: DailyPostPrompt.fromJson(json[r'prompt'])!,
        reflectiveAnswer: mapValueOfType<String>(json, r'reflectiveAnswer')!,
        caption: mapValueOfType<String>(json, r'caption')!,
        rating: mapValueOfType<int>(json, r'rating')!,
        audience: PostAudience.fromJson(json[r'audience'])!,
        acceptedAt: mapDateTime(json, r'acceptedAt', r'')!,
        releasedAt: mapDateTime(json, r'releasedAt', r'')!,
        tomorrowNote: DailyPostTomorrowNote.fromJson(json[r'tomorrowNote'])!,
        media: DailyPostMedia.listFromJson(json[r'media']),
        voiceMemo: DailyPostVoiceMemo.fromJson(json[r'voiceMemo']),
      );
    }
    return null;
  }

  static List<DailyPost> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <DailyPost>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = DailyPost.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, DailyPost> mapFromJson(dynamic json) {
    final map = <String, DailyPost>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = DailyPost.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of DailyPost-objects as value to a dart map
  static Map<String, List<DailyPost>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<DailyPost>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = DailyPost.listFromJson(
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
    'authorId',
    'localDate',
    'prompt',
    'reflectiveAnswer',
    'caption',
    'rating',
    'audience',
    'acceptedAt',
    'releasedAt',
    'tomorrowNote',
    'media',
    'voiceMemo',
  };
}

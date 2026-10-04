//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateDailyPostRequest {
  /// Returns a new [CreateDailyPostRequest] instance.
  CreateDailyPostRequest({
    required this.localDate,
    required this.promptId,
    required this.reflectiveAnswer,
    this.caption,
    required this.rating,
    required this.audience,
    this.tomorrowNote,
    this.attachments = const [],
    this.weather,
  });

  /// The Auckland day the draft was written for. It must still be the server's current day when the post is accepted.
  final String localDate;

  /// The prompt ID returned by GET /api/v1/posting-days/current for localDate.
  final String promptId;

  final String reflectiveAnswer;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? caption;

  /// Minimum value: 1
  /// Maximum value: 10
  final int rating;

  final PostAudience audience;

  /// An author-only note that becomes readable on the following Auckland day. It is never echoed back.
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? tomorrowNote;

  /// Validated media reservation IDs from POST /api/v1/media-reservations, in display order. Up to 3 photos or 1 video, never both, plus at most 1 voice memo, up to 25 MB in total. Omit it or send an empty list for a text-only post.
  final List<String> attachments;

  /// An optional weather snapshot from the author's phone. Omit it for a post without weather. The server checks its shape and ranges but cannot verify it. It cannot be added or changed after the post is created.
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final PostWeather? weather;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CreateDailyPostRequest &&
          other.localDate == localDate &&
          other.promptId == promptId &&
          other.reflectiveAnswer == reflectiveAnswer &&
          other.caption == caption &&
          other.rating == rating &&
          other.audience == audience &&
          other.tomorrowNote == tomorrowNote &&
          _deepEquality.equals(other.attachments, attachments) &&
          other.weather == weather;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (localDate.hashCode) +
      (promptId.hashCode) +
      (reflectiveAnswer.hashCode) +
      (caption == null ? 0 : caption!.hashCode) +
      (rating.hashCode) +
      (audience.hashCode) +
      (tomorrowNote == null ? 0 : tomorrowNote!.hashCode) +
      (attachments.hashCode) +
      (weather == null ? 0 : weather!.hashCode);

  @override
  String toString() =>
      'CreateDailyPostRequest[localDate=$localDate, promptId=$promptId, reflectiveAnswer=$reflectiveAnswer, caption=$caption, rating=$rating, audience=$audience, tomorrowNote=$tomorrowNote, attachments=$attachments, weather=$weather]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'localDate'] = this.localDate;
    json[r'promptId'] = this.promptId;
    json[r'reflectiveAnswer'] = this.reflectiveAnswer;
    if (this.caption != null) {
      json[r'caption'] = this.caption;
    } else {
      json[r'caption'] = null;
    }
    json[r'rating'] = this.rating;
    json[r'audience'] = this.audience;
    if (this.tomorrowNote != null) {
      json[r'tomorrowNote'] = this.tomorrowNote;
    } else {
      json[r'tomorrowNote'] = null;
    }
    json[r'attachments'] = this.attachments;
    if (this.weather != null) {
      json[r'weather'] = this.weather;
    } else {
      json[r'weather'] = null;
    }
    return json;
  }

  /// Clones this instance of [CreateDailyPostRequest] and returns a new one where some of the
  /// properties have changed.
  CreateDailyPostRequest copyWith({
    String? localDate,
    String? promptId,
    String? reflectiveAnswer,
    String? caption,
    int? rating,
    PostAudience? audience,
    String? tomorrowNote,
    List<String>? attachments,
    PostWeather? weather,
  }) =>
      CreateDailyPostRequest(
        localDate: localDate ?? this.localDate,
        promptId: promptId ?? this.promptId,
        reflectiveAnswer: reflectiveAnswer ?? this.reflectiveAnswer,
        caption: caption ?? this.caption,
        rating: rating ?? this.rating,
        audience: audience ?? this.audience,
        tomorrowNote: tomorrowNote ?? this.tomorrowNote,
        attachments: attachments ?? this.attachments,
        weather: weather ?? this.weather,
      );

  /// Returns a new [CreateDailyPostRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateDailyPostRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'localDate'),
            'Required key "CreateDailyPostRequest[localDate]" is missing from JSON.');
        assert(json[r'localDate'] != null,
            'Required key "CreateDailyPostRequest[localDate]" has a null value in JSON.');
        assert(json.containsKey(r'promptId'),
            'Required key "CreateDailyPostRequest[promptId]" is missing from JSON.');
        assert(json[r'promptId'] != null,
            'Required key "CreateDailyPostRequest[promptId]" has a null value in JSON.');
        assert(json.containsKey(r'reflectiveAnswer'),
            'Required key "CreateDailyPostRequest[reflectiveAnswer]" is missing from JSON.');
        assert(json[r'reflectiveAnswer'] != null,
            'Required key "CreateDailyPostRequest[reflectiveAnswer]" has a null value in JSON.');
        assert(json.containsKey(r'rating'),
            'Required key "CreateDailyPostRequest[rating]" is missing from JSON.');
        assert(json[r'rating'] != null,
            'Required key "CreateDailyPostRequest[rating]" has a null value in JSON.');
        assert(json.containsKey(r'audience'),
            'Required key "CreateDailyPostRequest[audience]" is missing from JSON.');
        assert(json[r'audience'] != null,
            'Required key "CreateDailyPostRequest[audience]" has a null value in JSON.');
        return true;
      }());

      return CreateDailyPostRequest(
        localDate: mapValueOfType<String>(json, r'localDate')!,
        promptId: mapValueOfType<String>(json, r'promptId')!,
        reflectiveAnswer: mapValueOfType<String>(json, r'reflectiveAnswer')!,
        caption: mapValueOfType<String>(json, r'caption'),
        rating: mapValueOfType<int>(json, r'rating')!,
        audience: PostAudience.fromJson(json[r'audience'])!,
        tomorrowNote: mapValueOfType<String>(json, r'tomorrowNote'),
        attachments: json[r'attachments'] is Iterable
            ? (json[r'attachments'] as Iterable)
                .cast<String>()
                .toList(growable: false)
            : const [],
        weather: PostWeather.fromJson(json[r'weather']),
      );
    }
    return null;
  }

  static List<CreateDailyPostRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <CreateDailyPostRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreateDailyPostRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateDailyPostRequest> mapFromJson(dynamic json) {
    final map = <String, CreateDailyPostRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateDailyPostRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateDailyPostRequest-objects as value to a dart map
  static Map<String, List<CreateDailyPostRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<CreateDailyPostRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreateDailyPostRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'localDate',
    'promptId',
    'reflectiveAnswer',
    'rating',
    'audience',
  };
}

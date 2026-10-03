//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class OnThisDayMemory {
  /// Returns a new [OnThisDayMemory] instance.
  OnThisDayMemory({
    required this.id,
    required this.localDate,
    required this.yearsAgo,
    required this.rating,
    required this.audience,
    required this.prompt,
    required this.reflectiveAnswer,
    required this.caption,
    required this.edited,
    this.media = const [],
  });

  final String id;

  /// The Auckland day the post was written for.
  final String localDate;

  /// Whole years between the post's Auckland day and today.
  ///
  /// Minimum value: 1
  final int yearsAgo;

  final int rating;

  /// Who could read the post. Memories are owner-only either way; this labels the original audience.
  final OnThisDayMemoryAudienceEnum audience;

  final OnThisDayMemoryPrompt prompt;

  final String reflectiveAnswer;

  final String? caption;

  /// True when the author has edited the post since it was accepted.
  final bool edited;

  /// Attached photos or video in display order, each with a private download URL that expires after 5 minutes.
  final List<PostMedia> media;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is OnThisDayMemory &&
          other.id == id &&
          other.localDate == localDate &&
          other.yearsAgo == yearsAgo &&
          other.rating == rating &&
          other.audience == audience &&
          other.prompt == prompt &&
          other.reflectiveAnswer == reflectiveAnswer &&
          other.caption == caption &&
          other.edited == edited &&
          _deepEquality.equals(other.media, media);

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (localDate.hashCode) +
      (yearsAgo.hashCode) +
      (rating.hashCode) +
      (audience.hashCode) +
      (prompt.hashCode) +
      (reflectiveAnswer.hashCode) +
      (caption == null ? 0 : caption!.hashCode) +
      (edited.hashCode) +
      (media.hashCode);

  @override
  String toString() =>
      'OnThisDayMemory[id=$id, localDate=$localDate, yearsAgo=$yearsAgo, rating=$rating, audience=$audience, prompt=$prompt, reflectiveAnswer=$reflectiveAnswer, caption=$caption, edited=$edited, media=$media]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'localDate'] = _dateFormatter.format(this.localDate);
    json[r'yearsAgo'] = this.yearsAgo;
    json[r'rating'] = this.rating;
    json[r'audience'] = this.audience;
    json[r'prompt'] = this.prompt;
    json[r'reflectiveAnswer'] = this.reflectiveAnswer;
    if (this.caption != null) {
      json[r'caption'] = this.caption;
    } else {
      json[r'caption'] = null;
    }
    json[r'edited'] = this.edited;
    json[r'media'] = this.media;
    return json;
  }

  /// Clones this instance of [OnThisDayMemory] and returns a new one where some of the
  /// properties have changed.
  OnThisDayMemory copyWith({
    String? id,
    String? localDate,
    int? yearsAgo,
    int? rating,
    OnThisDayMemoryAudienceEnum? audience,
    OnThisDayMemoryPrompt? prompt,
    String? reflectiveAnswer,
    String? caption,
    bool captionSetToNull = false,
    bool? edited,
    List<PostMedia>? media,
  }) =>
      OnThisDayMemory(
        id: id ?? this.id,
        localDate: localDate ?? this.localDate,
        yearsAgo: yearsAgo ?? this.yearsAgo,
        rating: rating ?? this.rating,
        audience: audience ?? this.audience,
        prompt: prompt ?? this.prompt,
        reflectiveAnswer: reflectiveAnswer ?? this.reflectiveAnswer,
        caption: captionSetToNull ? null : caption ?? this.caption,
        edited: edited ?? this.edited,
        media: media ?? this.media,
      );

  /// Returns a new [OnThisDayMemory] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static OnThisDayMemory? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "OnThisDayMemory[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "OnThisDayMemory[id]" has a null value in JSON.');
        assert(json.containsKey(r'localDate'),
            'Required key "OnThisDayMemory[localDate]" is missing from JSON.');
        assert(json[r'localDate'] != null,
            'Required key "OnThisDayMemory[localDate]" has a null value in JSON.');
        assert(json.containsKey(r'yearsAgo'),
            'Required key "OnThisDayMemory[yearsAgo]" is missing from JSON.');
        assert(json[r'yearsAgo'] != null,
            'Required key "OnThisDayMemory[yearsAgo]" has a null value in JSON.');
        assert(json.containsKey(r'rating'),
            'Required key "OnThisDayMemory[rating]" is missing from JSON.');
        assert(json[r'rating'] != null,
            'Required key "OnThisDayMemory[rating]" has a null value in JSON.');
        assert(json.containsKey(r'audience'),
            'Required key "OnThisDayMemory[audience]" is missing from JSON.');
        assert(json[r'audience'] != null,
            'Required key "OnThisDayMemory[audience]" has a null value in JSON.');
        assert(json.containsKey(r'prompt'),
            'Required key "OnThisDayMemory[prompt]" is missing from JSON.');
        assert(json[r'prompt'] != null,
            'Required key "OnThisDayMemory[prompt]" has a null value in JSON.');
        assert(json.containsKey(r'reflectiveAnswer'),
            'Required key "OnThisDayMemory[reflectiveAnswer]" is missing from JSON.');
        assert(json[r'reflectiveAnswer'] != null,
            'Required key "OnThisDayMemory[reflectiveAnswer]" has a null value in JSON.');
        assert(json.containsKey(r'caption'),
            'Required key "OnThisDayMemory[caption]" is missing from JSON.');
        assert(json.containsKey(r'edited'),
            'Required key "OnThisDayMemory[edited]" is missing from JSON.');
        assert(json[r'edited'] != null,
            'Required key "OnThisDayMemory[edited]" has a null value in JSON.');
        assert(json.containsKey(r'media'),
            'Required key "OnThisDayMemory[media]" is missing from JSON.');
        assert(json[r'media'] != null,
            'Required key "OnThisDayMemory[media]" has a null value in JSON.');
        return true;
      }());

      return OnThisDayMemory(
        id: mapValueOfType<String>(json, r'id')!,
        localDate: mapDateTime(json, r'localDate', r'')!,
        yearsAgo: mapValueOfType<int>(json, r'yearsAgo')!,
        rating: mapValueOfType<int>(json, r'rating')!,
        audience: OnThisDayMemoryAudienceEnum.fromJson(json[r'audience'])!,
        prompt: OnThisDayMemoryPrompt.fromJson(json[r'prompt'])!,
        reflectiveAnswer: mapValueOfType<String>(json, r'reflectiveAnswer')!,
        caption: mapValueOfType<String>(json, r'caption'),
        edited: mapValueOfType<bool>(json, r'edited')!,
        media: PostMedia.listFromJson(json[r'media']),
      );
    }
    return null;
  }

  static List<OnThisDayMemory> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <OnThisDayMemory>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = OnThisDayMemory.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, OnThisDayMemory> mapFromJson(dynamic json) {
    final map = <String, OnThisDayMemory>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = OnThisDayMemory.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of OnThisDayMemory-objects as value to a dart map
  static Map<String, List<OnThisDayMemory>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<OnThisDayMemory>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = OnThisDayMemory.listFromJson(
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
    'localDate',
    'yearsAgo',
    'rating',
    'audience',
    'prompt',
    'reflectiveAnswer',
    'caption',
    'edited',
    'media',
  };
}

/// Who could read the post. Memories are owner-only either way; this labels the original audience.
enum OnThisDayMemoryAudienceEnum {
  solo._(r'solo'),
  friends._(r'friends'),
  ;

  /// Instantiate a new enum with the provided value.
  const OnThisDayMemoryAudienceEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [OnThisDayMemoryAudienceEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static OnThisDayMemoryAudienceEnum? fromJson(dynamic value) =>
      OnThisDayMemoryAudienceEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [OnThisDayMemoryAudienceEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<OnThisDayMemoryAudienceEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <OnThisDayMemoryAudienceEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = OnThisDayMemoryAudienceEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [OnThisDayMemoryAudienceEnum] to String,
/// and [decode] dynamic data back to [OnThisDayMemoryAudienceEnum].
class OnThisDayMemoryAudienceEnumTypeTransformer {
  factory OnThisDayMemoryAudienceEnumTypeTransformer() =>
      _instance ??= const OnThisDayMemoryAudienceEnumTypeTransformer._();

  const OnThisDayMemoryAudienceEnumTypeTransformer._();

  String encode(OnThisDayMemoryAudienceEnum data) => data._value;

  /// Returns the instance of [OnThisDayMemoryAudienceEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  OnThisDayMemoryAudienceEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is OnThisDayMemoryAudienceEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'solo':
          return OnThisDayMemoryAudienceEnum.solo;
        case r'friends':
          return OnThisDayMemoryAudienceEnum.friends;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static OnThisDayMemoryAudienceEnumTypeTransformer? _instance;
}

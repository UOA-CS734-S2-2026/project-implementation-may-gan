//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UpdatePostRequest {
  /// Returns a new [UpdatePostRequest] instance.
  UpdatePostRequest({
    required this.expectedRevisionCount,
    this.reflectiveAnswer,
    this.caption,
    this.rating,
    this.audience,
  });

  /// The `revisionCount` of the post the author last read. If another edit has been saved since, the request is a 409.
  ///
  /// Minimum value: 0
  final int expectedRevisionCount;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? reflectiveAnswer;

  /// Null removes the caption.
  final String? caption;

  /// Minimum value: 1
  /// Maximum value: 10
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final int? rating;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final PostAudience? audience;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UpdatePostRequest &&
          other.expectedRevisionCount == expectedRevisionCount &&
          other.reflectiveAnswer == reflectiveAnswer &&
          other.caption == caption &&
          other.rating == rating &&
          other.audience == audience;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (expectedRevisionCount.hashCode) +
      (reflectiveAnswer == null ? 0 : reflectiveAnswer!.hashCode) +
      (caption == null ? 0 : caption!.hashCode) +
      (rating == null ? 0 : rating!.hashCode) +
      (audience == null ? 0 : audience!.hashCode);

  @override
  String toString() =>
      'UpdatePostRequest[expectedRevisionCount=$expectedRevisionCount, reflectiveAnswer=$reflectiveAnswer, caption=$caption, rating=$rating, audience=$audience]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'expectedRevisionCount'] = this.expectedRevisionCount;
    if (this.reflectiveAnswer != null) {
      json[r'reflectiveAnswer'] = this.reflectiveAnswer;
    } else {
      json[r'reflectiveAnswer'] = null;
    }
    if (this.caption != null) {
      json[r'caption'] = this.caption;
    } else {
      json[r'caption'] = null;
    }
    if (this.rating != null) {
      json[r'rating'] = this.rating;
    } else {
      json[r'rating'] = null;
    }
    if (this.audience != null) {
      json[r'audience'] = this.audience;
    } else {
      json[r'audience'] = null;
    }
    return json;
  }

  /// Clones this instance of [UpdatePostRequest] and returns a new one where some of the
  /// properties have changed.
  UpdatePostRequest copyWith({
    int? expectedRevisionCount,
    String? reflectiveAnswer,
    String? caption,
    bool captionSetToNull = false,
    int? rating,
    PostAudience? audience,
  }) =>
      UpdatePostRequest(
        expectedRevisionCount:
            expectedRevisionCount ?? this.expectedRevisionCount,
        reflectiveAnswer: reflectiveAnswer ?? this.reflectiveAnswer,
        caption: captionSetToNull ? null : caption ?? this.caption,
        rating: rating ?? this.rating,
        audience: audience ?? this.audience,
      );

  /// Returns a new [UpdatePostRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UpdatePostRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'expectedRevisionCount'),
            'Required key "UpdatePostRequest[expectedRevisionCount]" is missing from JSON.');
        assert(json[r'expectedRevisionCount'] != null,
            'Required key "UpdatePostRequest[expectedRevisionCount]" has a null value in JSON.');
        return true;
      }());

      return UpdatePostRequest(
        expectedRevisionCount:
            mapValueOfType<int>(json, r'expectedRevisionCount')!,
        reflectiveAnswer: mapValueOfType<String>(json, r'reflectiveAnswer'),
        caption: mapValueOfType<String>(json, r'caption'),
        rating: mapValueOfType<int>(json, r'rating'),
        audience: PostAudience.fromJson(json[r'audience']),
      );
    }
    return null;
  }

  static List<UpdatePostRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <UpdatePostRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UpdatePostRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UpdatePostRequest> mapFromJson(dynamic json) {
    final map = <String, UpdatePostRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UpdatePostRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UpdatePostRequest-objects as value to a dart map
  static Map<String, List<UpdatePostRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<UpdatePostRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UpdatePostRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'expectedRevisionCount',
  };
}

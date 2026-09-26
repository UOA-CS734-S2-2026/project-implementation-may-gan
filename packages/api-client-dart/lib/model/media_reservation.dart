//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MediaReservation {
  /// Returns a new [MediaReservation] instance.
  MediaReservation({
    required this.id,
    required this.contentType,
    required this.byteSize,
    required this.status,
    this.failureReason,
    required this.createdAt,
    this.validatedAt,
    required this.expiresAt,
  });

  final String id;

  final MediaContentType contentType;

  /// Minimum value: 0
  final int byteSize;

  final MediaReservationStatus status;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final MediaValidationFailureReason? failureReason;

  final DateTime createdAt;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final DateTime? validatedAt;

  final DateTime expiresAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MediaReservation &&
          other.id == id &&
          other.contentType == contentType &&
          other.byteSize == byteSize &&
          other.status == status &&
          other.failureReason == failureReason &&
          other.createdAt == createdAt &&
          other.validatedAt == validatedAt &&
          other.expiresAt == expiresAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (contentType.hashCode) +
      (byteSize.hashCode) +
      (status.hashCode) +
      (failureReason == null ? 0 : failureReason!.hashCode) +
      (createdAt.hashCode) +
      (validatedAt == null ? 0 : validatedAt!.hashCode) +
      (expiresAt.hashCode);

  @override
  String toString() =>
      'MediaReservation[id=$id, contentType=$contentType, byteSize=$byteSize, status=$status, failureReason=$failureReason, createdAt=$createdAt, validatedAt=$validatedAt, expiresAt=$expiresAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'contentType'] = this.contentType;
    json[r'byteSize'] = this.byteSize;
    json[r'status'] = this.status;
    if (this.failureReason != null) {
      json[r'failureReason'] = this.failureReason;
    } else {
      json[r'failureReason'] = null;
    }
    json[r'createdAt'] = this.createdAt.toUtc().toIso8601String();
    if (this.validatedAt != null) {
      json[r'validatedAt'] = this.validatedAt!.toUtc().toIso8601String();
    } else {
      json[r'validatedAt'] = null;
    }
    json[r'expiresAt'] = this.expiresAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [MediaReservation] and returns a new one where some of the
  /// properties have changed.
  MediaReservation copyWith({
    String? id,
    MediaContentType? contentType,
    int? byteSize,
    MediaReservationStatus? status,
    MediaValidationFailureReason? failureReason,
    DateTime? createdAt,
    DateTime? validatedAt,
    DateTime? expiresAt,
  }) =>
      MediaReservation(
        id: id ?? this.id,
        contentType: contentType ?? this.contentType,
        byteSize: byteSize ?? this.byteSize,
        status: status ?? this.status,
        failureReason: failureReason ?? this.failureReason,
        createdAt: createdAt ?? this.createdAt,
        validatedAt: validatedAt ?? this.validatedAt,
        expiresAt: expiresAt ?? this.expiresAt,
      );

  /// Returns a new [MediaReservation] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MediaReservation? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "MediaReservation[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "MediaReservation[id]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'),
            'Required key "MediaReservation[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null,
            'Required key "MediaReservation[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'byteSize'),
            'Required key "MediaReservation[byteSize]" is missing from JSON.');
        assert(json[r'byteSize'] != null,
            'Required key "MediaReservation[byteSize]" has a null value in JSON.');
        assert(json.containsKey(r'status'),
            'Required key "MediaReservation[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "MediaReservation[status]" has a null value in JSON.');
        assert(json.containsKey(r'createdAt'),
            'Required key "MediaReservation[createdAt]" is missing from JSON.');
        assert(json[r'createdAt'] != null,
            'Required key "MediaReservation[createdAt]" has a null value in JSON.');
        assert(json.containsKey(r'expiresAt'),
            'Required key "MediaReservation[expiresAt]" is missing from JSON.');
        assert(json[r'expiresAt'] != null,
            'Required key "MediaReservation[expiresAt]" has a null value in JSON.');
        return true;
      }());

      return MediaReservation(
        id: mapValueOfType<String>(json, r'id')!,
        contentType: MediaContentType.fromJson(json[r'contentType'])!,
        byteSize: mapValueOfType<int>(json, r'byteSize')!,
        status: MediaReservationStatus.fromJson(json[r'status'])!,
        failureReason:
            MediaValidationFailureReason.fromJson(json[r'failureReason']),
        createdAt: mapDateTime(json, r'createdAt', r'')!,
        validatedAt: mapDateTime(json, r'validatedAt', r''),
        expiresAt: mapDateTime(json, r'expiresAt', r'')!,
      );
    }
    return null;
  }

  static List<MediaReservation> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <MediaReservation>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MediaReservation.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MediaReservation> mapFromJson(dynamic json) {
    final map = <String, MediaReservation>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MediaReservation.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MediaReservation-objects as value to a dart map
  static Map<String, List<MediaReservation>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<MediaReservation>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MediaReservation.listFromJson(
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
    'contentType',
    'byteSize',
    'status',
    'createdAt',
    'expiresAt',
  };
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

enum MediaValidationFailureReason {
  byteSizeMismatch._(r'byte_size_mismatch'),
  formatMismatch._(r'format_mismatch'),
  durationExceeded._(r'duration_exceeded'),
  malformedContainer._(r'malformed_container'),
  objectNotFound._(r'object_not_found'),
  ;

  /// Instantiate a new enum with the provided value.
  const MediaValidationFailureReason._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [MediaValidationFailureReason] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static MediaValidationFailureReason? fromJson(dynamic value) =>
      MediaValidationFailureReasonTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [MediaValidationFailureReason]
  /// that were successfully decoded from the passed [JSON][json].
  static List<MediaValidationFailureReason> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <MediaValidationFailureReason>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MediaValidationFailureReason.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MediaValidationFailureReason] to String,
/// and [decode] dynamic data back to [MediaValidationFailureReason].
class MediaValidationFailureReasonTypeTransformer {
  factory MediaValidationFailureReasonTypeTransformer() =>
      _instance ??= const MediaValidationFailureReasonTypeTransformer._();

  const MediaValidationFailureReasonTypeTransformer._();

  /// Encodes this enum as a value suitable for JSON.
  String encode(MediaValidationFailureReason data) => data._value;

  /// Returns the instance of [MediaValidationFailureReason] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MediaValidationFailureReason? decode(dynamic data, {bool allowNull = true}) {
    if (data is MediaValidationFailureReason) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'byte_size_mismatch':
          return MediaValidationFailureReason.byteSizeMismatch;
        case r'format_mismatch':
          return MediaValidationFailureReason.formatMismatch;
        case r'duration_exceeded':
          return MediaValidationFailureReason.durationExceeded;
        case r'malformed_container':
          return MediaValidationFailureReason.malformedContainer;
        case r'object_not_found':
          return MediaValidationFailureReason.objectNotFound;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static MediaValidationFailureReasonTypeTransformer? _instance;
}

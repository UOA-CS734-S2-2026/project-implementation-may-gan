//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

enum MediaReservationStatus {
  pending._(r'pending'),
  expired._(r'expired'),
  ;

  /// Instantiate a new enum with the provided value.
  const MediaReservationStatus._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [MediaReservationStatus] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static MediaReservationStatus? fromJson(dynamic value) =>
      MediaReservationStatusTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [MediaReservationStatus]
  /// that were successfully decoded from the passed [JSON][json].
  static List<MediaReservationStatus> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <MediaReservationStatus>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MediaReservationStatus.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MediaReservationStatus] to String,
/// and [decode] dynamic data back to [MediaReservationStatus].
class MediaReservationStatusTypeTransformer {
  factory MediaReservationStatusTypeTransformer() =>
      _instance ??= const MediaReservationStatusTypeTransformer._();

  const MediaReservationStatusTypeTransformer._();

  /// Encodes this enum as a value suitable for JSON.
  String encode(MediaReservationStatus data) => data._value;

  /// Returns the instance of [MediaReservationStatus] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MediaReservationStatus? decode(dynamic data, {bool allowNull = true}) {
    if (data is MediaReservationStatus) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'pending':
          return MediaReservationStatus.pending;
        case r'expired':
          return MediaReservationStatus.expired;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static MediaReservationStatusTypeTransformer? _instance;
}

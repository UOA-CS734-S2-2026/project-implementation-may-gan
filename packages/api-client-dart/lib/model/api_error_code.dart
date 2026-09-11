//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

enum ApiErrorCode {
  BAD_REQUEST._(r'BAD_REQUEST'),
  UNAUTHENTICATED._(r'UNAUTHENTICATED'),
  FORBIDDEN._(r'FORBIDDEN'),
  NOT_FOUND._(r'NOT_FOUND'),
  CONFLICT._(r'CONFLICT'),
  VALIDATION_FAILED._(r'VALIDATION_FAILED'),
  RATE_LIMITED._(r'RATE_LIMITED'),
  INTERNAL_ERROR._(r'INTERNAL_ERROR'),
  SERVICE_UNAVAILABLE._(r'SERVICE_UNAVAILABLE'),
  ;

  /// Instantiate a new enum with the provided value.
  const ApiErrorCode._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [ApiErrorCode] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static ApiErrorCode? fromJson(dynamic value) =>
      ApiErrorCodeTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [ApiErrorCode]
  /// that were successfully decoded from the passed [JSON][json].
  static List<ApiErrorCode> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ApiErrorCode>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ApiErrorCode.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ApiErrorCode] to String,
/// and [decode] dynamic data back to [ApiErrorCode].
class ApiErrorCodeTypeTransformer {
  factory ApiErrorCodeTypeTransformer() =>
      _instance ??= const ApiErrorCodeTypeTransformer._();

  const ApiErrorCodeTypeTransformer._();

  /// Encodes this enum as a value suitable for JSON.
  String encode(ApiErrorCode data) => data._value;

  /// Returns the instance of [ApiErrorCode] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ApiErrorCode? decode(dynamic data, {bool allowNull = true}) {
    if (data is ApiErrorCode) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'BAD_REQUEST':
          return ApiErrorCode.BAD_REQUEST;
        case r'UNAUTHENTICATED':
          return ApiErrorCode.UNAUTHENTICATED;
        case r'FORBIDDEN':
          return ApiErrorCode.FORBIDDEN;
        case r'NOT_FOUND':
          return ApiErrorCode.NOT_FOUND;
        case r'CONFLICT':
          return ApiErrorCode.CONFLICT;
        case r'VALIDATION_FAILED':
          return ApiErrorCode.VALIDATION_FAILED;
        case r'RATE_LIMITED':
          return ApiErrorCode.RATE_LIMITED;
        case r'INTERNAL_ERROR':
          return ApiErrorCode.INTERNAL_ERROR;
        case r'SERVICE_UNAVAILABLE':
          return ApiErrorCode.SERVICE_UNAVAILABLE;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static ApiErrorCodeTypeTransformer? _instance;
}

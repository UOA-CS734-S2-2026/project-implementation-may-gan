//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

enum PostWeatherCondition {
  clear._(r'clear'),
  partlyCloudy._(r'partly_cloudy'),
  cloudy._(r'cloudy'),
  fog._(r'fog'),
  drizzle._(r'drizzle'),
  rain._(r'rain'),
  snow._(r'snow'),
  thunderstorm._(r'thunderstorm'),
  ;

  /// Instantiate a new enum with the provided value.
  const PostWeatherCondition._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [PostWeatherCondition] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static PostWeatherCondition? fromJson(dynamic value) =>
      PostWeatherConditionTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [PostWeatherCondition]
  /// that were successfully decoded from the passed [JSON][json].
  static List<PostWeatherCondition> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostWeatherCondition>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostWeatherCondition.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [PostWeatherCondition] to String,
/// and [decode] dynamic data back to [PostWeatherCondition].
class PostWeatherConditionTypeTransformer {
  factory PostWeatherConditionTypeTransformer() =>
      _instance ??= const PostWeatherConditionTypeTransformer._();

  const PostWeatherConditionTypeTransformer._();

  /// Encodes this enum as a value suitable for JSON.
  String encode(PostWeatherCondition data) => data._value;

  /// Returns the instance of [PostWeatherCondition] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  PostWeatherCondition? decode(dynamic data, {bool allowNull = true}) {
    if (data is PostWeatherCondition) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'clear':
          return PostWeatherCondition.clear;
        case r'partly_cloudy':
          return PostWeatherCondition.partlyCloudy;
        case r'cloudy':
          return PostWeatherCondition.cloudy;
        case r'fog':
          return PostWeatherCondition.fog;
        case r'drizzle':
          return PostWeatherCondition.drizzle;
        case r'rain':
          return PostWeatherCondition.rain;
        case r'snow':
          return PostWeatherCondition.snow;
        case r'thunderstorm':
          return PostWeatherCondition.thunderstorm;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static PostWeatherConditionTypeTransformer? _instance;
}

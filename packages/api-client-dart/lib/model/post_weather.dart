//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PostWeather {
  /// Returns a new [PostWeather] instance.
  PostWeather({
    required this.condition,
    required this.temperatureC,
    required this.placeName,
  });

  final PostWeatherCondition condition;

  /// Whole degrees Celsius.
  ///
  /// Minimum value: -90
  /// Maximum value: 60
  final int temperatureC;

  /// A place name such as a city, trimmed, 1 to 80 characters, with no control characters. Never an address or coordinates.
  final String placeName;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PostWeather &&
          other.condition == condition &&
          other.temperatureC == temperatureC &&
          other.placeName == placeName;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (condition.hashCode) + (temperatureC.hashCode) + (placeName.hashCode);

  @override
  String toString() =>
      'PostWeather[condition=$condition, temperatureC=$temperatureC, placeName=$placeName]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'condition'] = this.condition;
    json[r'temperatureC'] = this.temperatureC;
    json[r'placeName'] = this.placeName;
    return json;
  }

  /// Clones this instance of [PostWeather] and returns a new one where some of the
  /// properties have changed.
  PostWeather copyWith({
    PostWeatherCondition? condition,
    int? temperatureC,
    String? placeName,
  }) =>
      PostWeather(
        condition: condition ?? this.condition,
        temperatureC: temperatureC ?? this.temperatureC,
        placeName: placeName ?? this.placeName,
      );

  /// Returns a new [PostWeather] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PostWeather? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'condition'),
            'Required key "PostWeather[condition]" is missing from JSON.');
        assert(json[r'condition'] != null,
            'Required key "PostWeather[condition]" has a null value in JSON.');
        assert(json.containsKey(r'temperatureC'),
            'Required key "PostWeather[temperatureC]" is missing from JSON.');
        assert(json[r'temperatureC'] != null,
            'Required key "PostWeather[temperatureC]" has a null value in JSON.');
        assert(json.containsKey(r'placeName'),
            'Required key "PostWeather[placeName]" is missing from JSON.');
        assert(json[r'placeName'] != null,
            'Required key "PostWeather[placeName]" has a null value in JSON.');
        return true;
      }());

      return PostWeather(
        condition: PostWeatherCondition.fromJson(json[r'condition'])!,
        temperatureC: mapValueOfType<int>(json, r'temperatureC')!,
        placeName: mapValueOfType<String>(json, r'placeName')!,
      );
    }
    return null;
  }

  static List<PostWeather> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostWeather>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostWeather.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PostWeather> mapFromJson(dynamic json) {
    final map = <String, PostWeather>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PostWeather.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PostWeather-objects as value to a dart map
  static Map<String, List<PostWeather>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PostWeather>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PostWeather.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'condition',
    'temperatureC',
    'placeName',
  };
}

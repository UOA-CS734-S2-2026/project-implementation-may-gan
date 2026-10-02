//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MoodDay {
  /// Returns a new [MoodDay] instance.
  MoodDay({
    required this.localDate,
    required this.rating,
  });

  final String localDate;

  /// Minimum value: 1
  /// Maximum value: 10
  final int rating;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MoodDay &&
          other.localDate == localDate &&
          other.rating == rating;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (localDate.hashCode) + (rating.hashCode);

  @override
  String toString() => 'MoodDay[localDate=$localDate, rating=$rating]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'localDate'] = _dateFormatter.format(this.localDate);
    json[r'rating'] = this.rating;
    return json;
  }

  /// Clones this instance of [MoodDay] and returns a new one where some of the
  /// properties have changed.
  MoodDay copyWith({
    String? localDate,
    int? rating,
  }) =>
      MoodDay(
        localDate: localDate ?? this.localDate,
        rating: rating ?? this.rating,
      );

  /// Returns a new [MoodDay] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MoodDay? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'localDate'),
            'Required key "MoodDay[localDate]" is missing from JSON.');
        assert(json[r'localDate'] != null,
            'Required key "MoodDay[localDate]" has a null value in JSON.');
        assert(json.containsKey(r'rating'),
            'Required key "MoodDay[rating]" is missing from JSON.');
        assert(json[r'rating'] != null,
            'Required key "MoodDay[rating]" has a null value in JSON.');
        return true;
      }());

      return MoodDay(
        localDate: mapDateTime(json, r'localDate', r'')!,
        rating: mapValueOfType<int>(json, r'rating')!,
      );
    }
    return null;
  }

  static List<MoodDay> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <MoodDay>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MoodDay.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MoodDay> mapFromJson(dynamic json) {
    final map = <String, MoodDay>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MoodDay.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MoodDay-objects as value to a dart map
  static Map<String, List<MoodDay>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<MoodDay>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MoodDay.listFromJson(
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
    'rating',
  };
}

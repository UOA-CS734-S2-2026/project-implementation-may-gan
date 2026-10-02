//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MoodPeriodSummary {
  /// Returns a new [MoodPeriodSummary] instance.
  MoodPeriodSummary({
    required this.from,
    required this.to,
    required this.trackedDays,
    required this.postedDays,
    required this.missingDays,
    required this.average,
    required this.lowest,
    required this.highest,
  });

  final String from;

  final String to;

  /// Days in the period since the account's first day. Earlier days are not missing data.
  ///
  /// Minimum value: 0
  final int trackedDays;

  /// Minimum value: 0
  final int postedDays;

  /// Tracked days that ended without a post. Today is not missing while it is still open.
  ///
  /// Minimum value: 0
  final int missingDays;

  /// Mean rating to one decimal place, or null with no posts.
  final num? average;

  /// Minimum value: 1
  /// Maximum value: 10
  final int? lowest;

  /// Minimum value: 1
  /// Maximum value: 10
  final int? highest;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MoodPeriodSummary &&
          other.from == from &&
          other.to == to &&
          other.trackedDays == trackedDays &&
          other.postedDays == postedDays &&
          other.missingDays == missingDays &&
          other.average == average &&
          other.lowest == lowest &&
          other.highest == highest;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (from.hashCode) +
      (to.hashCode) +
      (trackedDays.hashCode) +
      (postedDays.hashCode) +
      (missingDays.hashCode) +
      (average == null ? 0 : average!.hashCode) +
      (lowest == null ? 0 : lowest!.hashCode) +
      (highest == null ? 0 : highest!.hashCode);

  @override
  String toString() =>
      'MoodPeriodSummary[from=$from, to=$to, trackedDays=$trackedDays, postedDays=$postedDays, missingDays=$missingDays, average=$average, lowest=$lowest, highest=$highest]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'from'] = _dateFormatter.format(this.from);
    json[r'to'] = _dateFormatter.format(this.to);
    json[r'trackedDays'] = this.trackedDays;
    json[r'postedDays'] = this.postedDays;
    json[r'missingDays'] = this.missingDays;
    if (this.average != null) {
      json[r'average'] = this.average;
    } else {
      json[r'average'] = null;
    }
    if (this.lowest != null) {
      json[r'lowest'] = this.lowest;
    } else {
      json[r'lowest'] = null;
    }
    if (this.highest != null) {
      json[r'highest'] = this.highest;
    } else {
      json[r'highest'] = null;
    }
    return json;
  }

  /// Clones this instance of [MoodPeriodSummary] and returns a new one where some of the
  /// properties have changed.
  MoodPeriodSummary copyWith({
    String? from,
    String? to,
    int? trackedDays,
    int? postedDays,
    int? missingDays,
    num? average,
    bool averageSetToNull = false,
    int? lowest,
    bool lowestSetToNull = false,
    int? highest,
    bool highestSetToNull = false,
  }) =>
      MoodPeriodSummary(
        from: from ?? this.from,
        to: to ?? this.to,
        trackedDays: trackedDays ?? this.trackedDays,
        postedDays: postedDays ?? this.postedDays,
        missingDays: missingDays ?? this.missingDays,
        average: averageSetToNull ? null : average ?? this.average,
        lowest: lowestSetToNull ? null : lowest ?? this.lowest,
        highest: highestSetToNull ? null : highest ?? this.highest,
      );

  /// Returns a new [MoodPeriodSummary] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MoodPeriodSummary? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'from'),
            'Required key "MoodPeriodSummary[from]" is missing from JSON.');
        assert(json[r'from'] != null,
            'Required key "MoodPeriodSummary[from]" has a null value in JSON.');
        assert(json.containsKey(r'to'),
            'Required key "MoodPeriodSummary[to]" is missing from JSON.');
        assert(json[r'to'] != null,
            'Required key "MoodPeriodSummary[to]" has a null value in JSON.');
        assert(json.containsKey(r'trackedDays'),
            'Required key "MoodPeriodSummary[trackedDays]" is missing from JSON.');
        assert(json[r'trackedDays'] != null,
            'Required key "MoodPeriodSummary[trackedDays]" has a null value in JSON.');
        assert(json.containsKey(r'postedDays'),
            'Required key "MoodPeriodSummary[postedDays]" is missing from JSON.');
        assert(json[r'postedDays'] != null,
            'Required key "MoodPeriodSummary[postedDays]" has a null value in JSON.');
        assert(json.containsKey(r'missingDays'),
            'Required key "MoodPeriodSummary[missingDays]" is missing from JSON.');
        assert(json[r'missingDays'] != null,
            'Required key "MoodPeriodSummary[missingDays]" has a null value in JSON.');
        assert(json.containsKey(r'average'),
            'Required key "MoodPeriodSummary[average]" is missing from JSON.');
        assert(json.containsKey(r'lowest'),
            'Required key "MoodPeriodSummary[lowest]" is missing from JSON.');
        assert(json.containsKey(r'highest'),
            'Required key "MoodPeriodSummary[highest]" is missing from JSON.');
        return true;
      }());

      return MoodPeriodSummary(
        from: mapDateTime(json, r'from', r'')!,
        to: mapDateTime(json, r'to', r'')!,
        trackedDays: mapValueOfType<int>(json, r'trackedDays')!,
        postedDays: mapValueOfType<int>(json, r'postedDays')!,
        missingDays: mapValueOfType<int>(json, r'missingDays')!,
        average:
            json[r'average'] == null ? null : num.parse('${json[r'average']}'),
        lowest: mapValueOfType<int>(json, r'lowest'),
        highest: mapValueOfType<int>(json, r'highest'),
      );
    }
    return null;
  }

  static List<MoodPeriodSummary> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <MoodPeriodSummary>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MoodPeriodSummary.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MoodPeriodSummary> mapFromJson(dynamic json) {
    final map = <String, MoodPeriodSummary>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MoodPeriodSummary.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MoodPeriodSummary-objects as value to a dart map
  static Map<String, List<MoodPeriodSummary>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<MoodPeriodSummary>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MoodPeriodSummary.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'from',
    'to',
    'trackedDays',
    'postedDays',
    'missingDays',
    'average',
    'lowest',
    'highest',
  };
}

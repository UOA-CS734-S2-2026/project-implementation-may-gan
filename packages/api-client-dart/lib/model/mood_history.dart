//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MoodHistory {
  /// Returns a new [MoodHistory] instance.
  MoodHistory({
    required this.range,
    required this.trackedFrom,
    this.days = const [],
    this.hiddenDays = const [],
    required this.current,
    required this.previous,
  });

  final MoodHistoryRangeEnum range;

  /// The account's first Auckland day, or its earliest post if that is sooner.
  final String trackedFrom;

  /// Rated days the caller can see in the current period, oldest first.
  final List<MoodDay> days;

  /// Days in the current period with a post the caller can't see, such as a solo post or today's post before midnight. They are not missing.
  final List<String> hiddenDays;

  final MoodPeriodSummary current;

  /// The same-length range just before it, for comparison.
  final MoodPeriodSummary previous;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MoodHistory &&
          other.range == range &&
          other.trackedFrom == trackedFrom &&
          _deepEquality.equals(other.days, days) &&
          _deepEquality.equals(other.hiddenDays, hiddenDays) &&
          other.current == current &&
          other.previous == previous;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (range.hashCode) +
      (trackedFrom.hashCode) +
      (days.hashCode) +
      (hiddenDays.hashCode) +
      (current.hashCode) +
      (previous.hashCode);

  @override
  String toString() =>
      'MoodHistory[range=$range, trackedFrom=$trackedFrom, days=$days, hiddenDays=$hiddenDays, current=$current, previous=$previous]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'range'] = this.range;
    json[r'trackedFrom'] = this.trackedFrom;
    json[r'days'] = this.days;
    json[r'hiddenDays'] = this.hiddenDays;
    json[r'current'] = this.current;
    json[r'previous'] = this.previous;
    return json;
  }

  /// Clones this instance of [MoodHistory] and returns a new one where some of the
  /// properties have changed.
  MoodHistory copyWith({
    MoodHistoryRangeEnum? range,
    String? trackedFrom,
    List<MoodDay>? days,
    List<String>? hiddenDays,
    MoodPeriodSummary? current,
    MoodPeriodSummary? previous,
  }) =>
      MoodHistory(
        range: range ?? this.range,
        trackedFrom: trackedFrom ?? this.trackedFrom,
        days: days ?? this.days,
        hiddenDays: hiddenDays ?? this.hiddenDays,
        current: current ?? this.current,
        previous: previous ?? this.previous,
      );

  /// Returns a new [MoodHistory] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MoodHistory? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'range'),
            'Required key "MoodHistory[range]" is missing from JSON.');
        assert(json[r'range'] != null,
            'Required key "MoodHistory[range]" has a null value in JSON.');
        assert(json.containsKey(r'trackedFrom'),
            'Required key "MoodHistory[trackedFrom]" is missing from JSON.');
        assert(json[r'trackedFrom'] != null,
            'Required key "MoodHistory[trackedFrom]" has a null value in JSON.');
        assert(json.containsKey(r'days'),
            'Required key "MoodHistory[days]" is missing from JSON.');
        assert(json[r'days'] != null,
            'Required key "MoodHistory[days]" has a null value in JSON.');
        assert(json.containsKey(r'hiddenDays'),
            'Required key "MoodHistory[hiddenDays]" is missing from JSON.');
        assert(json[r'hiddenDays'] != null,
            'Required key "MoodHistory[hiddenDays]" has a null value in JSON.');
        assert(json.containsKey(r'current'),
            'Required key "MoodHistory[current]" is missing from JSON.');
        assert(json[r'current'] != null,
            'Required key "MoodHistory[current]" has a null value in JSON.');
        assert(json.containsKey(r'previous'),
            'Required key "MoodHistory[previous]" is missing from JSON.');
        assert(json[r'previous'] != null,
            'Required key "MoodHistory[previous]" has a null value in JSON.');
        return true;
      }());

      return MoodHistory(
        range: MoodHistoryRangeEnum.fromJson(json[r'range'])!,
        trackedFrom: mapValueOfType<String>(json, r'trackedFrom')!,
        days: MoodDay.listFromJson(json[r'days']),
        hiddenDays: json[r'hiddenDays'] is Iterable
            ? (json[r'hiddenDays'] as Iterable)
                .cast<String>()
                .toList(growable: false)
            : const [],
        current: MoodPeriodSummary.fromJson(json[r'current'])!,
        previous: MoodPeriodSummary.fromJson(json[r'previous'])!,
      );
    }
    return null;
  }

  static List<MoodHistory> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <MoodHistory>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MoodHistory.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MoodHistory> mapFromJson(dynamic json) {
    final map = <String, MoodHistory>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MoodHistory.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MoodHistory-objects as value to a dart map
  static Map<String, List<MoodHistory>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<MoodHistory>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MoodHistory.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'range',
    'trackedFrom',
    'days',
    'hiddenDays',
    'current',
    'previous',
  };
}

enum MoodHistoryRangeEnum {
  n30d._(r'30d'),
  n90d._(r'90d'),
  n1y._(r'1y'),
  ;

  /// Instantiate a new enum with the provided value.
  const MoodHistoryRangeEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [MoodHistoryRangeEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static MoodHistoryRangeEnum? fromJson(dynamic value) =>
      MoodHistoryRangeEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [MoodHistoryRangeEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<MoodHistoryRangeEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <MoodHistoryRangeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MoodHistoryRangeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MoodHistoryRangeEnum] to String,
/// and [decode] dynamic data back to [MoodHistoryRangeEnum].
class MoodHistoryRangeEnumTypeTransformer {
  factory MoodHistoryRangeEnumTypeTransformer() =>
      _instance ??= const MoodHistoryRangeEnumTypeTransformer._();

  const MoodHistoryRangeEnumTypeTransformer._();

  String encode(MoodHistoryRangeEnum data) => data._value;

  /// Returns the instance of [MoodHistoryRangeEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MoodHistoryRangeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is MoodHistoryRangeEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'30d':
          return MoodHistoryRangeEnum.n30d;
        case r'90d':
          return MoodHistoryRangeEnum.n90d;
        case r'1y':
          return MoodHistoryRangeEnum.n1y;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static MoodHistoryRangeEnumTypeTransformer? _instance;
}

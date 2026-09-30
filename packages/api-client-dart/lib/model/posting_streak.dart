//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PostingStreak {
  /// Returns a new [PostingStreak] instance.
  PostingStreak({
    required this.current,
    required this.longest,
    required this.lastPostDate,
    required this.postedToday,
    required this.asOf,
  });

  /// Consecutive Auckland days with an accepted post, ending today, or yesterday while today is still open.
  ///
  /// Minimum value: 0
  final int current;

  /// Minimum value: 0
  final int longest;

  final String lastPostDate;

  final bool postedToday;

  /// The Auckland day the values were calculated for. They hold until that day's midnight unless a post is accepted or deleted.
  final String asOf;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PostingStreak &&
          other.current == current &&
          other.longest == longest &&
          other.lastPostDate == lastPostDate &&
          other.postedToday == postedToday &&
          other.asOf == asOf;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (current.hashCode) +
      (longest.hashCode) +
      (lastPostDate.hashCode) +
      (postedToday.hashCode) +
      (asOf.hashCode);

  @override
  String toString() =>
      'PostingStreak[current=$current, longest=$longest, lastPostDate=$lastPostDate, postedToday=$postedToday, asOf=$asOf]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'current'] = this.current;
    json[r'longest'] = this.longest;
    json[r'lastPostDate'] = _dateFormatter.format(this.lastPostDate);
    json[r'postedToday'] = this.postedToday;
    json[r'asOf'] = _dateFormatter.format(this.asOf);
    return json;
  }

  /// Clones this instance of [PostingStreak] and returns a new one where some of the
  /// properties have changed.
  PostingStreak copyWith({
    int? current,
    int? longest,
    String? lastPostDate,
    bool? postedToday,
    String? asOf,
  }) =>
      PostingStreak(
        current: current ?? this.current,
        longest: longest ?? this.longest,
        lastPostDate: lastPostDate ?? this.lastPostDate,
        postedToday: postedToday ?? this.postedToday,
        asOf: asOf ?? this.asOf,
      );

  /// Returns a new [PostingStreak] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PostingStreak? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'current'),
            'Required key "PostingStreak[current]" is missing from JSON.');
        assert(json[r'current'] != null,
            'Required key "PostingStreak[current]" has a null value in JSON.');
        assert(json.containsKey(r'longest'),
            'Required key "PostingStreak[longest]" is missing from JSON.');
        assert(json[r'longest'] != null,
            'Required key "PostingStreak[longest]" has a null value in JSON.');
        assert(json.containsKey(r'lastPostDate'),
            'Required key "PostingStreak[lastPostDate]" is missing from JSON.');
        assert(json[r'lastPostDate'] != null,
            'Required key "PostingStreak[lastPostDate]" has a null value in JSON.');
        assert(json.containsKey(r'postedToday'),
            'Required key "PostingStreak[postedToday]" is missing from JSON.');
        assert(json[r'postedToday'] != null,
            'Required key "PostingStreak[postedToday]" has a null value in JSON.');
        assert(json.containsKey(r'asOf'),
            'Required key "PostingStreak[asOf]" is missing from JSON.');
        assert(json[r'asOf'] != null,
            'Required key "PostingStreak[asOf]" has a null value in JSON.');
        return true;
      }());

      return PostingStreak(
        current: mapValueOfType<int>(json, r'current')!,
        longest: mapValueOfType<int>(json, r'longest')!,
        lastPostDate: mapDateTime(json, r'lastPostDate', r'')!,
        postedToday: mapValueOfType<bool>(json, r'postedToday')!,
        asOf: mapDateTime(json, r'asOf', r'')!,
      );
    }
    return null;
  }

  static List<PostingStreak> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostingStreak>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostingStreak.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PostingStreak> mapFromJson(dynamic json) {
    final map = <String, PostingStreak>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PostingStreak.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PostingStreak-objects as value to a dart map
  static Map<String, List<PostingStreak>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PostingStreak>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PostingStreak.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'current',
    'longest',
    'lastPostDate',
    'postedToday',
    'asOf',
  };
}

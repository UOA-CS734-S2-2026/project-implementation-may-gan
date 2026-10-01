//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FeedPage {
  /// Returns a new [FeedPage] instance.
  FeedPage({
    this.items = const [],
    required this.nextCursor,
    required this.hasMore,
    required this.feedDate,
  });

  final List<FeedPost> items;

  final String nextCursor;

  final bool hasMore;

  /// The Auckland day the page shows: yesterday, released at the most recent midnight.
  final String feedDate;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is FeedPage &&
          _deepEquality.equals(other.items, items) &&
          other.nextCursor == nextCursor &&
          other.hasMore == hasMore &&
          other.feedDate == feedDate;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (items.hashCode) +
      (nextCursor.hashCode) +
      (hasMore.hashCode) +
      (feedDate.hashCode);

  @override
  String toString() =>
      'FeedPage[items=$items, nextCursor=$nextCursor, hasMore=$hasMore, feedDate=$feedDate]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'items'] = this.items;
    json[r'nextCursor'] = this.nextCursor;
    json[r'hasMore'] = this.hasMore;
    json[r'feedDate'] = this.feedDate;
    return json;
  }

  /// Clones this instance of [FeedPage] and returns a new one where some of the
  /// properties have changed.
  FeedPage copyWith({
    List<FeedPost>? items,
    String? nextCursor,
    bool? hasMore,
    String? feedDate,
  }) =>
      FeedPage(
        items: items ?? this.items,
        nextCursor: nextCursor ?? this.nextCursor,
        hasMore: hasMore ?? this.hasMore,
        feedDate: feedDate ?? this.feedDate,
      );

  /// Returns a new [FeedPage] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FeedPage? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'items'),
            'Required key "FeedPage[items]" is missing from JSON.');
        assert(json[r'items'] != null,
            'Required key "FeedPage[items]" has a null value in JSON.');
        assert(json.containsKey(r'nextCursor'),
            'Required key "FeedPage[nextCursor]" is missing from JSON.');
        assert(json[r'nextCursor'] != null,
            'Required key "FeedPage[nextCursor]" has a null value in JSON.');
        assert(json.containsKey(r'hasMore'),
            'Required key "FeedPage[hasMore]" is missing from JSON.');
        assert(json[r'hasMore'] != null,
            'Required key "FeedPage[hasMore]" has a null value in JSON.');
        assert(json.containsKey(r'feedDate'),
            'Required key "FeedPage[feedDate]" is missing from JSON.');
        assert(json[r'feedDate'] != null,
            'Required key "FeedPage[feedDate]" has a null value in JSON.');
        return true;
      }());

      return FeedPage(
        items: FeedPost.listFromJson(json[r'items']),
        nextCursor: mapValueOfType<String>(json, r'nextCursor')!,
        hasMore: mapValueOfType<bool>(json, r'hasMore')!,
        feedDate: mapValueOfType<String>(json, r'feedDate')!,
      );
    }
    return null;
  }

  static List<FeedPage> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <FeedPage>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FeedPage.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FeedPage> mapFromJson(dynamic json) {
    final map = <String, FeedPage>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FeedPage.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FeedPage-objects as value to a dart map
  static Map<String, List<FeedPage>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<FeedPage>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FeedPage.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'items',
    'nextCursor',
    'hasMore',
    'feedDate',
  };
}

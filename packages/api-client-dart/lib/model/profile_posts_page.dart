//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ProfilePostsPage {
  /// Returns a new [ProfilePostsPage] instance.
  ProfilePostsPage({
    this.items = const [],
    required this.nextCursor,
    required this.hasMore,
  });

  final List<ProfilePost> items;

  final String nextCursor;

  final bool hasMore;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ProfilePostsPage &&
          _deepEquality.equals(other.items, items) &&
          other.nextCursor == nextCursor &&
          other.hasMore == hasMore;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (items.hashCode) + (nextCursor.hashCode) + (hasMore.hashCode);

  @override
  String toString() =>
      'ProfilePostsPage[items=$items, nextCursor=$nextCursor, hasMore=$hasMore]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'items'] = this.items;
    json[r'nextCursor'] = this.nextCursor;
    json[r'hasMore'] = this.hasMore;
    return json;
  }

  /// Clones this instance of [ProfilePostsPage] and returns a new one where some of the
  /// properties have changed.
  ProfilePostsPage copyWith({
    List<ProfilePost>? items,
    String? nextCursor,
    bool? hasMore,
  }) =>
      ProfilePostsPage(
        items: items ?? this.items,
        nextCursor: nextCursor ?? this.nextCursor,
        hasMore: hasMore ?? this.hasMore,
      );

  /// Returns a new [ProfilePostsPage] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ProfilePostsPage? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'items'),
            'Required key "ProfilePostsPage[items]" is missing from JSON.');
        assert(json[r'items'] != null,
            'Required key "ProfilePostsPage[items]" has a null value in JSON.');
        assert(json.containsKey(r'nextCursor'),
            'Required key "ProfilePostsPage[nextCursor]" is missing from JSON.');
        assert(json[r'nextCursor'] != null,
            'Required key "ProfilePostsPage[nextCursor]" has a null value in JSON.');
        assert(json.containsKey(r'hasMore'),
            'Required key "ProfilePostsPage[hasMore]" is missing from JSON.');
        assert(json[r'hasMore'] != null,
            'Required key "ProfilePostsPage[hasMore]" has a null value in JSON.');
        return true;
      }());

      return ProfilePostsPage(
        items: ProfilePost.listFromJson(json[r'items']),
        nextCursor: mapValueOfType<String>(json, r'nextCursor')!,
        hasMore: mapValueOfType<bool>(json, r'hasMore')!,
      );
    }
    return null;
  }

  static List<ProfilePostsPage> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ProfilePostsPage>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ProfilePostsPage.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ProfilePostsPage> mapFromJson(dynamic json) {
    final map = <String, ProfilePostsPage>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ProfilePostsPage.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ProfilePostsPage-objects as value to a dart map
  static Map<String, List<ProfilePostsPage>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ProfilePostsPage>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ProfilePostsPage.listFromJson(
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
  };
}

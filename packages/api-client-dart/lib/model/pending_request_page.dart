//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PendingRequestPage {
  /// Returns a new [PendingRequestPage] instance.
  PendingRequestPage({
    this.items = const [],
    required this.nextCursor,
    required this.hasMore,
  });

  final List<PendingRelationshipRequest> items;

  final String nextCursor;

  final bool hasMore;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PendingRequestPage &&
          _deepEquality.equals(other.items, items) &&
          other.nextCursor == nextCursor &&
          other.hasMore == hasMore;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (items.hashCode) + (nextCursor.hashCode) + (hasMore.hashCode);

  @override
  String toString() =>
      'PendingRequestPage[items=$items, nextCursor=$nextCursor, hasMore=$hasMore]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'items'] = this.items;
    json[r'nextCursor'] = this.nextCursor;
    json[r'hasMore'] = this.hasMore;
    return json;
  }

  /// Clones this instance of [PendingRequestPage] and returns a new one where some of the
  /// properties have changed.
  PendingRequestPage copyWith({
    List<PendingRelationshipRequest>? items,
    String? nextCursor,
    bool? hasMore,
  }) =>
      PendingRequestPage(
        items: items ?? this.items,
        nextCursor: nextCursor ?? this.nextCursor,
        hasMore: hasMore ?? this.hasMore,
      );

  /// Returns a new [PendingRequestPage] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PendingRequestPage? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'items'),
            'Required key "PendingRequestPage[items]" is missing from JSON.');
        assert(json[r'items'] != null,
            'Required key "PendingRequestPage[items]" has a null value in JSON.');
        assert(json.containsKey(r'nextCursor'),
            'Required key "PendingRequestPage[nextCursor]" is missing from JSON.');
        assert(json[r'nextCursor'] != null,
            'Required key "PendingRequestPage[nextCursor]" has a null value in JSON.');
        assert(json.containsKey(r'hasMore'),
            'Required key "PendingRequestPage[hasMore]" is missing from JSON.');
        assert(json[r'hasMore'] != null,
            'Required key "PendingRequestPage[hasMore]" has a null value in JSON.');
        return true;
      }());

      return PendingRequestPage(
        items: PendingRelationshipRequest.listFromJson(json[r'items']),
        nextCursor: mapValueOfType<String>(json, r'nextCursor')!,
        hasMore: mapValueOfType<bool>(json, r'hasMore')!,
      );
    }
    return null;
  }

  static List<PendingRequestPage> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PendingRequestPage>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PendingRequestPage.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PendingRequestPage> mapFromJson(dynamic json) {
    final map = <String, PendingRequestPage>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PendingRequestPage.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PendingRequestPage-objects as value to a dart map
  static Map<String, List<PendingRequestPage>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PendingRequestPage>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PendingRequestPage.listFromJson(
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

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ListConversationChanges200Response {
  /// Returns a new [ListConversationChanges200Response] instance.
  ListConversationChanges200Response({
    this.items = const [],
    required this.nextChangeSequence,
    required this.hasMore,
    required this.highWatermark,
  });

  final List<ListConversationChanges200ResponseItemsInner> items;

  final String? nextChangeSequence;

  final bool hasMore;

  final String highWatermark;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ListConversationChanges200Response &&
          _deepEquality.equals(other.items, items) &&
          other.nextChangeSequence == nextChangeSequence &&
          other.hasMore == hasMore &&
          other.highWatermark == highWatermark;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (items.hashCode) +
      (nextChangeSequence == null ? 0 : nextChangeSequence!.hashCode) +
      (hasMore.hashCode) +
      (highWatermark.hashCode);

  @override
  String toString() =>
      'ListConversationChanges200Response[items=$items, nextChangeSequence=$nextChangeSequence, hasMore=$hasMore, highWatermark=$highWatermark]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'items'] = this.items;
    if (this.nextChangeSequence != null) {
      json[r'nextChangeSequence'] = this.nextChangeSequence;
    } else {
      json[r'nextChangeSequence'] = null;
    }
    json[r'hasMore'] = this.hasMore;
    json[r'highWatermark'] = this.highWatermark;
    return json;
  }

  /// Clones this instance of [ListConversationChanges200Response] and returns a new one where some of the
  /// properties have changed.
  ListConversationChanges200Response copyWith({
    List<ListConversationChanges200ResponseItemsInner>? items,
    String? nextChangeSequence,
    bool nextChangeSequenceSetToNull = false,
    bool? hasMore,
    String? highWatermark,
  }) =>
      ListConversationChanges200Response(
        items: items ?? this.items,
        nextChangeSequence: nextChangeSequenceSetToNull
            ? null
            : nextChangeSequence ?? this.nextChangeSequence,
        hasMore: hasMore ?? this.hasMore,
        highWatermark: highWatermark ?? this.highWatermark,
      );

  /// Returns a new [ListConversationChanges200Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ListConversationChanges200Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'items'),
            'Required key "ListConversationChanges200Response[items]" is missing from JSON.');
        assert(json[r'items'] != null,
            'Required key "ListConversationChanges200Response[items]" has a null value in JSON.');
        assert(json.containsKey(r'nextChangeSequence'),
            'Required key "ListConversationChanges200Response[nextChangeSequence]" is missing from JSON.');
        assert(json.containsKey(r'hasMore'),
            'Required key "ListConversationChanges200Response[hasMore]" is missing from JSON.');
        assert(json[r'hasMore'] != null,
            'Required key "ListConversationChanges200Response[hasMore]" has a null value in JSON.');
        assert(json.containsKey(r'highWatermark'),
            'Required key "ListConversationChanges200Response[highWatermark]" is missing from JSON.');
        assert(json[r'highWatermark'] != null,
            'Required key "ListConversationChanges200Response[highWatermark]" has a null value in JSON.');
        return true;
      }());

      return ListConversationChanges200Response(
        items: ListConversationChanges200ResponseItemsInner.listFromJson(
            json[r'items']),
        nextChangeSequence: mapValueOfType<String>(json, r'nextChangeSequence'),
        hasMore: mapValueOfType<bool>(json, r'hasMore')!,
        highWatermark: mapValueOfType<String>(json, r'highWatermark')!,
      );
    }
    return null;
  }

  static List<ListConversationChanges200Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ListConversationChanges200Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ListConversationChanges200Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ListConversationChanges200Response> mapFromJson(
      dynamic json) {
    final map = <String, ListConversationChanges200Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ListConversationChanges200Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ListConversationChanges200Response-objects as value to a dart map
  static Map<String, List<ListConversationChanges200Response>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ListConversationChanges200Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ListConversationChanges200Response.listFromJson(
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
    'nextChangeSequence',
    'hasMore',
    'highWatermark',
  };
}

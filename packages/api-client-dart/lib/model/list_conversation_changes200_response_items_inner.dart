//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ListConversationChanges200ResponseItemsInner {
  /// Returns a new [ListConversationChanges200ResponseItemsInner] instance.
  ListConversationChanges200ResponseItemsInner({
    required this.changeSequence,
    required this.kind,
    required this.messageId,
    required this.memberId,
    required this.createdAt,
  });

  final String changeSequence;

  final String kind;

  final String messageId;

  final String memberId;

  final DateTime createdAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ListConversationChanges200ResponseItemsInner &&
          other.changeSequence == changeSequence &&
          other.kind == kind &&
          other.messageId == messageId &&
          other.memberId == memberId &&
          other.createdAt == createdAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (changeSequence.hashCode) +
      (kind.hashCode) +
      (messageId.hashCode) +
      (memberId.hashCode) +
      (createdAt.hashCode);

  @override
  String toString() =>
      'ListConversationChanges200ResponseItemsInner[changeSequence=$changeSequence, kind=$kind, messageId=$messageId, memberId=$memberId, createdAt=$createdAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'changeSequence'] = this.changeSequence;
    json[r'kind'] = this.kind;
    json[r'messageId'] = this.messageId;
    json[r'memberId'] = this.memberId;
    json[r'createdAt'] = this.createdAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [ListConversationChanges200ResponseItemsInner] and returns a new one where some of the
  /// properties have changed.
  ListConversationChanges200ResponseItemsInner copyWith({
    String? changeSequence,
    String? kind,
    String? messageId,
    String? memberId,
    DateTime? createdAt,
  }) =>
      ListConversationChanges200ResponseItemsInner(
        changeSequence: changeSequence ?? this.changeSequence,
        kind: kind ?? this.kind,
        messageId: messageId ?? this.messageId,
        memberId: memberId ?? this.memberId,
        createdAt: createdAt ?? this.createdAt,
      );

  /// Returns a new [ListConversationChanges200ResponseItemsInner] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ListConversationChanges200ResponseItemsInner? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'changeSequence'),
            'Required key "ListConversationChanges200ResponseItemsInner[changeSequence]" is missing from JSON.');
        assert(json[r'changeSequence'] != null,
            'Required key "ListConversationChanges200ResponseItemsInner[changeSequence]" has a null value in JSON.');
        assert(json.containsKey(r'kind'),
            'Required key "ListConversationChanges200ResponseItemsInner[kind]" is missing from JSON.');
        assert(json[r'kind'] != null,
            'Required key "ListConversationChanges200ResponseItemsInner[kind]" has a null value in JSON.');
        assert(json.containsKey(r'messageId'),
            'Required key "ListConversationChanges200ResponseItemsInner[messageId]" is missing from JSON.');
        assert(json[r'messageId'] != null,
            'Required key "ListConversationChanges200ResponseItemsInner[messageId]" has a null value in JSON.');
        assert(json.containsKey(r'memberId'),
            'Required key "ListConversationChanges200ResponseItemsInner[memberId]" is missing from JSON.');
        assert(json[r'memberId'] != null,
            'Required key "ListConversationChanges200ResponseItemsInner[memberId]" has a null value in JSON.');
        assert(json.containsKey(r'createdAt'),
            'Required key "ListConversationChanges200ResponseItemsInner[createdAt]" is missing from JSON.');
        assert(json[r'createdAt'] != null,
            'Required key "ListConversationChanges200ResponseItemsInner[createdAt]" has a null value in JSON.');
        return true;
      }());

      return ListConversationChanges200ResponseItemsInner(
        changeSequence: mapValueOfType<String>(json, r'changeSequence')!,
        kind: mapValueOfType<String>(json, r'kind')!,
        messageId: mapValueOfType<String>(json, r'messageId')!,
        memberId: mapValueOfType<String>(json, r'memberId')!,
        createdAt: mapDateTime(json, r'createdAt', r'')!,
      );
    }
    return null;
  }

  static List<ListConversationChanges200ResponseItemsInner> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ListConversationChanges200ResponseItemsInner>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            ListConversationChanges200ResponseItemsInner.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ListConversationChanges200ResponseItemsInner> mapFromJson(
      dynamic json) {
    final map = <String, ListConversationChanges200ResponseItemsInner>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value =
            ListConversationChanges200ResponseItemsInner.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ListConversationChanges200ResponseItemsInner-objects as value to a dart map
  static Map<String, List<ListConversationChanges200ResponseItemsInner>>
      mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ListConversationChanges200ResponseItemsInner>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] =
            ListConversationChanges200ResponseItemsInner.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'changeSequence',
    'kind',
    'messageId',
    'memberId',
    'createdAt',
  };
}

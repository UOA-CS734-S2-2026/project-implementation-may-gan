//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class GetMessagingUnread200Response {
  /// Returns a new [GetMessagingUnread200Response] instance.
  GetMessagingUnread200Response({
    required this.inboxCount,
    required this.requestCount,
  });

  /// Minimum value: 0
  final int inboxCount;

  /// Minimum value: 0
  final int requestCount;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GetMessagingUnread200Response &&
          other.inboxCount == inboxCount &&
          other.requestCount == requestCount;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (inboxCount.hashCode) + (requestCount.hashCode);

  @override
  String toString() =>
      'GetMessagingUnread200Response[inboxCount=$inboxCount, requestCount=$requestCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'inboxCount'] = this.inboxCount;
    json[r'requestCount'] = this.requestCount;
    return json;
  }

  /// Clones this instance of [GetMessagingUnread200Response] and returns a new one where some of the
  /// properties have changed.
  GetMessagingUnread200Response copyWith({
    int? inboxCount,
    int? requestCount,
  }) =>
      GetMessagingUnread200Response(
        inboxCount: inboxCount ?? this.inboxCount,
        requestCount: requestCount ?? this.requestCount,
      );

  /// Returns a new [GetMessagingUnread200Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static GetMessagingUnread200Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'inboxCount'),
            'Required key "GetMessagingUnread200Response[inboxCount]" is missing from JSON.');
        assert(json[r'inboxCount'] != null,
            'Required key "GetMessagingUnread200Response[inboxCount]" has a null value in JSON.');
        assert(json.containsKey(r'requestCount'),
            'Required key "GetMessagingUnread200Response[requestCount]" is missing from JSON.');
        assert(json[r'requestCount'] != null,
            'Required key "GetMessagingUnread200Response[requestCount]" has a null value in JSON.');
        return true;
      }());

      return GetMessagingUnread200Response(
        inboxCount: mapValueOfType<int>(json, r'inboxCount')!,
        requestCount: mapValueOfType<int>(json, r'requestCount')!,
      );
    }
    return null;
  }

  static List<GetMessagingUnread200Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <GetMessagingUnread200Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = GetMessagingUnread200Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, GetMessagingUnread200Response> mapFromJson(dynamic json) {
    final map = <String, GetMessagingUnread200Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = GetMessagingUnread200Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of GetMessagingUnread200Response-objects as value to a dart map
  static Map<String, List<GetMessagingUnread200Response>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<GetMessagingUnread200Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = GetMessagingUnread200Response.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'inboxCount',
    'requestCount',
  };
}

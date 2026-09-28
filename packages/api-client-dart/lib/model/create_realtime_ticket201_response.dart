//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateRealtimeTicket201Response {
  /// Returns a new [CreateRealtimeTicket201Response] instance.
  CreateRealtimeTicket201Response({
    required this.ticket,
    required this.expiresAt,
    required this.webSocketUrl,
  });

  final String ticket;

  final DateTime expiresAt;

  final String webSocketUrl;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CreateRealtimeTicket201Response &&
          other.ticket == ticket &&
          other.expiresAt == expiresAt &&
          other.webSocketUrl == webSocketUrl;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (ticket.hashCode) + (expiresAt.hashCode) + (webSocketUrl.hashCode);

  @override
  String toString() =>
      'CreateRealtimeTicket201Response[ticket=$ticket, expiresAt=$expiresAt, webSocketUrl=$webSocketUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'ticket'] = this.ticket;
    json[r'expiresAt'] = this.expiresAt.toUtc().toIso8601String();
    json[r'webSocketUrl'] = this.webSocketUrl;
    return json;
  }

  /// Clones this instance of [CreateRealtimeTicket201Response] and returns a new one where some of the
  /// properties have changed.
  CreateRealtimeTicket201Response copyWith({
    String? ticket,
    DateTime? expiresAt,
    String? webSocketUrl,
  }) =>
      CreateRealtimeTicket201Response(
        ticket: ticket ?? this.ticket,
        expiresAt: expiresAt ?? this.expiresAt,
        webSocketUrl: webSocketUrl ?? this.webSocketUrl,
      );

  /// Returns a new [CreateRealtimeTicket201Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateRealtimeTicket201Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'ticket'),
            'Required key "CreateRealtimeTicket201Response[ticket]" is missing from JSON.');
        assert(json[r'ticket'] != null,
            'Required key "CreateRealtimeTicket201Response[ticket]" has a null value in JSON.');
        assert(json.containsKey(r'expiresAt'),
            'Required key "CreateRealtimeTicket201Response[expiresAt]" is missing from JSON.');
        assert(json[r'expiresAt'] != null,
            'Required key "CreateRealtimeTicket201Response[expiresAt]" has a null value in JSON.');
        assert(json.containsKey(r'webSocketUrl'),
            'Required key "CreateRealtimeTicket201Response[webSocketUrl]" is missing from JSON.');
        assert(json[r'webSocketUrl'] != null,
            'Required key "CreateRealtimeTicket201Response[webSocketUrl]" has a null value in JSON.');
        return true;
      }());

      return CreateRealtimeTicket201Response(
        ticket: mapValueOfType<String>(json, r'ticket')!,
        expiresAt: mapDateTime(json, r'expiresAt', r'')!,
        webSocketUrl: mapValueOfType<String>(json, r'webSocketUrl')!,
      );
    }
    return null;
  }

  static List<CreateRealtimeTicket201Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <CreateRealtimeTicket201Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreateRealtimeTicket201Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateRealtimeTicket201Response> mapFromJson(
      dynamic json) {
    final map = <String, CreateRealtimeTicket201Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateRealtimeTicket201Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateRealtimeTicket201Response-objects as value to a dart map
  static Map<String, List<CreateRealtimeTicket201Response>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<CreateRealtimeTicket201Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreateRealtimeTicket201Response.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'ticket',
    'expiresAt',
    'webSocketUrl',
  };
}

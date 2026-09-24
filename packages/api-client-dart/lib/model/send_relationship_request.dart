//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class SendRelationshipRequest {
  /// Returns a new [SendRelationshipRequest] instance.
  SendRelationshipRequest({
    required this.recipientId,
  });

  final String recipientId;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SendRelationshipRequest && other.recipientId == recipientId;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (recipientId.hashCode);

  @override
  String toString() => 'SendRelationshipRequest[recipientId=$recipientId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'recipientId'] = this.recipientId;
    return json;
  }

  /// Clones this instance of [SendRelationshipRequest] and returns a new one where some of the
  /// properties have changed.
  SendRelationshipRequest copyWith({
    String? recipientId,
  }) =>
      SendRelationshipRequest(
        recipientId: recipientId ?? this.recipientId,
      );

  /// Returns a new [SendRelationshipRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static SendRelationshipRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'recipientId'),
            'Required key "SendRelationshipRequest[recipientId]" is missing from JSON.');
        assert(json[r'recipientId'] != null,
            'Required key "SendRelationshipRequest[recipientId]" has a null value in JSON.');
        return true;
      }());

      return SendRelationshipRequest(
        recipientId: mapValueOfType<String>(json, r'recipientId')!,
      );
    }
    return null;
  }

  static List<SendRelationshipRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <SendRelationshipRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SendRelationshipRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, SendRelationshipRequest> mapFromJson(dynamic json) {
    final map = <String, SendRelationshipRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = SendRelationshipRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of SendRelationshipRequest-objects as value to a dart map
  static Map<String, List<SendRelationshipRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<SendRelationshipRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = SendRelationshipRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'recipientId',
  };
}

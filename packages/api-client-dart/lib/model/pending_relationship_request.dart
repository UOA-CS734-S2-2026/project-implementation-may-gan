//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PendingRelationshipRequest {
  /// Returns a new [PendingRelationshipRequest] instance.
  PendingRelationshipRequest({
    required this.id,
    required this.senderId,
    required this.recipientId,
    required this.createdAt,
  });

  final String id;

  final String senderId;

  final String recipientId;

  final DateTime createdAt;

  @override
  bool operator ==(Object other) => identical(this, other) || other is PendingRelationshipRequest &&
    other.id == id &&
    other.senderId == senderId &&
    other.recipientId == recipientId &&
    other.createdAt == createdAt;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (senderId.hashCode) +
    (recipientId.hashCode) +
    (createdAt.hashCode);

  @override
  String toString() => 'PendingRelationshipRequest[id=$id, senderId=$senderId, recipientId=$recipientId, createdAt=$createdAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'senderId'] = this.senderId;
      json[r'recipientId'] = this.recipientId;
      json[r'createdAt'] = this.createdAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [PendingRelationshipRequest] and returns a new one where some of the
  /// properties have changed.
  PendingRelationshipRequest copyWith({
    String? id,
    String? senderId,
    String? recipientId,
    DateTime? createdAt,
  }) => PendingRelationshipRequest(
    id: id ?? this.id,
    senderId: senderId ?? this.senderId,
    recipientId: recipientId ?? this.recipientId,
    createdAt: createdAt ?? this.createdAt,
  );

  /// Returns a new [PendingRelationshipRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PendingRelationshipRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "PendingRelationshipRequest[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "PendingRelationshipRequest[id]" has a null value in JSON.');
        assert(json.containsKey(r'senderId'), 'Required key "PendingRelationshipRequest[senderId]" is missing from JSON.');
        assert(json[r'senderId'] != null, 'Required key "PendingRelationshipRequest[senderId]" has a null value in JSON.');
        assert(json.containsKey(r'recipientId'), 'Required key "PendingRelationshipRequest[recipientId]" is missing from JSON.');
        assert(json[r'recipientId'] != null, 'Required key "PendingRelationshipRequest[recipientId]" has a null value in JSON.');
        assert(json.containsKey(r'createdAt'), 'Required key "PendingRelationshipRequest[createdAt]" is missing from JSON.');
        assert(json[r'createdAt'] != null, 'Required key "PendingRelationshipRequest[createdAt]" has a null value in JSON.');
        return true;
      }());

      return PendingRelationshipRequest(
        id: mapValueOfType<String>(json, r'id')!,
        senderId: mapValueOfType<String>(json, r'senderId')!,
        recipientId: mapValueOfType<String>(json, r'recipientId')!,
        createdAt: mapDateTime(json, r'createdAt', r'')!,
      );
    }
    return null;
  }

  static List<PendingRelationshipRequest> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <PendingRelationshipRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PendingRelationshipRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PendingRelationshipRequest> mapFromJson(dynamic json) {
    final map = <String, PendingRelationshipRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PendingRelationshipRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PendingRelationshipRequest-objects as value to a dart map
  static Map<String, List<PendingRelationshipRequest>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<PendingRelationshipRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PendingRelationshipRequest.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'senderId',
    'recipientId',
    'createdAt',
  };
}

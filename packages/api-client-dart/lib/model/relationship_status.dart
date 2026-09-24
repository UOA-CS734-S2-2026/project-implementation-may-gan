//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RelationshipStatus {
  /// Returns a new [RelationshipStatus] instance.
  RelationshipStatus({
    required this.userId,
    required this.status,
    required this.incomingRequest,
    required this.outgoingRequest,
  });

  final String userId;

  final RelationshipState status;

  final PendingRelationshipRequest incomingRequest;

  final PendingRelationshipRequest outgoingRequest;

  @override
  bool operator ==(Object other) => identical(this, other) || other is RelationshipStatus &&
    other.userId == userId &&
    other.status == status &&
    other.incomingRequest == incomingRequest &&
    other.outgoingRequest == outgoingRequest;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (userId.hashCode) +
    (status.hashCode) +
    (incomingRequest.hashCode) +
    (outgoingRequest.hashCode);

  @override
  String toString() => 'RelationshipStatus[userId=$userId, status=$status, incomingRequest=$incomingRequest, outgoingRequest=$outgoingRequest]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'userId'] = this.userId;
      json[r'status'] = this.status;
      json[r'incomingRequest'] = this.incomingRequest;
      json[r'outgoingRequest'] = this.outgoingRequest;
    return json;
  }

  /// Clones this instance of [RelationshipStatus] and returns a new one where some of the
  /// properties have changed.
  RelationshipStatus copyWith({
    String? userId,
    RelationshipState? status,
    PendingRelationshipRequest? incomingRequest,
    PendingRelationshipRequest? outgoingRequest,
  }) => RelationshipStatus(
    userId: userId ?? this.userId,
    status: status ?? this.status,
    incomingRequest: incomingRequest ?? this.incomingRequest,
    outgoingRequest: outgoingRequest ?? this.outgoingRequest,
  );

  /// Returns a new [RelationshipStatus] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RelationshipStatus? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'userId'), 'Required key "RelationshipStatus[userId]" is missing from JSON.');
        assert(json[r'userId'] != null, 'Required key "RelationshipStatus[userId]" has a null value in JSON.');
        assert(json.containsKey(r'status'), 'Required key "RelationshipStatus[status]" is missing from JSON.');
        assert(json[r'status'] != null, 'Required key "RelationshipStatus[status]" has a null value in JSON.');
        assert(json.containsKey(r'incomingRequest'), 'Required key "RelationshipStatus[incomingRequest]" is missing from JSON.');
        assert(json[r'incomingRequest'] != null, 'Required key "RelationshipStatus[incomingRequest]" has a null value in JSON.');
        assert(json.containsKey(r'outgoingRequest'), 'Required key "RelationshipStatus[outgoingRequest]" is missing from JSON.');
        assert(json[r'outgoingRequest'] != null, 'Required key "RelationshipStatus[outgoingRequest]" has a null value in JSON.');
        return true;
      }());

      return RelationshipStatus(
        userId: mapValueOfType<String>(json, r'userId')!,
        status: RelationshipState.fromJson(json[r'status'])!,
        incomingRequest: PendingRelationshipRequest.fromJson(json[r'incomingRequest'])!,
        outgoingRequest: PendingRelationshipRequest.fromJson(json[r'outgoingRequest'])!,
      );
    }
    return null;
  }

  static List<RelationshipStatus> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <RelationshipStatus>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RelationshipStatus.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RelationshipStatus> mapFromJson(dynamic json) {
    final map = <String, RelationshipStatus>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RelationshipStatus.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RelationshipStatus-objects as value to a dart map
  static Map<String, List<RelationshipStatus>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<RelationshipStatus>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RelationshipStatus.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'userId',
    'status',
    'incomingRequest',
    'outgoingRequest',
  };
}

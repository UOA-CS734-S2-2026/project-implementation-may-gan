//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class SetAvatarRequest {
  /// Returns a new [SetAvatarRequest] instance.
  SetAvatarRequest({
    required this.reservationId,
  });

  /// A validated upload from `POST /api/v1/media-reservations` of a JPEG, PNG, or WebP image.
  final String reservationId;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SetAvatarRequest && other.reservationId == reservationId;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (reservationId.hashCode);

  @override
  String toString() => 'SetAvatarRequest[reservationId=$reservationId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'reservationId'] = this.reservationId;
    return json;
  }

  /// Clones this instance of [SetAvatarRequest] and returns a new one where some of the
  /// properties have changed.
  SetAvatarRequest copyWith({
    String? reservationId,
  }) =>
      SetAvatarRequest(
        reservationId: reservationId ?? this.reservationId,
      );

  /// Returns a new [SetAvatarRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static SetAvatarRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'reservationId'),
            'Required key "SetAvatarRequest[reservationId]" is missing from JSON.');
        assert(json[r'reservationId'] != null,
            'Required key "SetAvatarRequest[reservationId]" has a null value in JSON.');
        return true;
      }());

      return SetAvatarRequest(
        reservationId: mapValueOfType<String>(json, r'reservationId')!,
      );
    }
    return null;
  }

  static List<SetAvatarRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <SetAvatarRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SetAvatarRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, SetAvatarRequest> mapFromJson(dynamic json) {
    final map = <String, SetAvatarRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = SetAvatarRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of SetAvatarRequest-objects as value to a dart map
  static Map<String, List<SetAvatarRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<SetAvatarRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = SetAvatarRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'reservationId',
  };
}

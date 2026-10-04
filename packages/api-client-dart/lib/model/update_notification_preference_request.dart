//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UpdateNotificationPreferenceRequest {
  /// Returns a new [UpdateNotificationPreferenceRequest] instance.
  UpdateNotificationPreferenceRequest({
    required this.enabled,
  });

  final bool enabled;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UpdateNotificationPreferenceRequest && other.enabled == enabled;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (enabled.hashCode);

  @override
  String toString() => 'UpdateNotificationPreferenceRequest[enabled=$enabled]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'enabled'] = this.enabled;
    return json;
  }

  /// Clones this instance of [UpdateNotificationPreferenceRequest] and returns a new one where some of the
  /// properties have changed.
  UpdateNotificationPreferenceRequest copyWith({
    bool? enabled,
  }) =>
      UpdateNotificationPreferenceRequest(
        enabled: enabled ?? this.enabled,
      );

  /// Returns a new [UpdateNotificationPreferenceRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UpdateNotificationPreferenceRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'enabled'),
            'Required key "UpdateNotificationPreferenceRequest[enabled]" is missing from JSON.');
        assert(json[r'enabled'] != null,
            'Required key "UpdateNotificationPreferenceRequest[enabled]" has a null value in JSON.');
        return true;
      }());

      return UpdateNotificationPreferenceRequest(
        enabled: mapValueOfType<bool>(json, r'enabled')!,
      );
    }
    return null;
  }

  static List<UpdateNotificationPreferenceRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <UpdateNotificationPreferenceRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UpdateNotificationPreferenceRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UpdateNotificationPreferenceRequest> mapFromJson(
      dynamic json) {
    final map = <String, UpdateNotificationPreferenceRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UpdateNotificationPreferenceRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UpdateNotificationPreferenceRequest-objects as value to a dart map
  static Map<String, List<UpdateNotificationPreferenceRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<UpdateNotificationPreferenceRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UpdateNotificationPreferenceRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'enabled',
  };
}

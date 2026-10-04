//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class DirectMessageSendQuotaError {
  /// Returns a new [DirectMessageSendQuotaError] instance.
  DirectMessageSendQuotaError({
    required this.error,
  });

  final DirectMessageSendQuotaErrorError error;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DirectMessageSendQuotaError && other.error == error;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (error.hashCode);

  @override
  String toString() => 'DirectMessageSendQuotaError[error=$error]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'error'] = this.error;
    return json;
  }

  /// Clones this instance of [DirectMessageSendQuotaError] and returns a new one where some of the
  /// properties have changed.
  DirectMessageSendQuotaError copyWith({
    DirectMessageSendQuotaErrorError? error,
  }) =>
      DirectMessageSendQuotaError(
        error: error ?? this.error,
      );

  /// Returns a new [DirectMessageSendQuotaError] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static DirectMessageSendQuotaError? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'error'),
            'Required key "DirectMessageSendQuotaError[error]" is missing from JSON.');
        assert(json[r'error'] != null,
            'Required key "DirectMessageSendQuotaError[error]" has a null value in JSON.');
        return true;
      }());

      return DirectMessageSendQuotaError(
        error: DirectMessageSendQuotaErrorError.fromJson(json[r'error'])!,
      );
    }
    return null;
  }

  static List<DirectMessageSendQuotaError> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <DirectMessageSendQuotaError>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = DirectMessageSendQuotaError.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, DirectMessageSendQuotaError> mapFromJson(dynamic json) {
    final map = <String, DirectMessageSendQuotaError>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = DirectMessageSendQuotaError.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of DirectMessageSendQuotaError-objects as value to a dart map
  static Map<String, List<DirectMessageSendQuotaError>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<DirectMessageSendQuotaError>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = DirectMessageSendQuotaError.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'error',
  };
}

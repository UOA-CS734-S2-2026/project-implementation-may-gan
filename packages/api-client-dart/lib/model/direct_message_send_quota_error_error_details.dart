//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class DirectMessageSendQuotaErrorErrorDetails {
  /// Returns a new [DirectMessageSendQuotaErrorErrorDetails] instance.
  DirectMessageSendQuotaErrorErrorDetails({
    required this.retryAfterSeconds,
  });

  /// Minimum value: 1
  final int retryAfterSeconds;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DirectMessageSendQuotaErrorErrorDetails &&
          other.retryAfterSeconds == retryAfterSeconds;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (retryAfterSeconds.hashCode);

  @override
  String toString() =>
      'DirectMessageSendQuotaErrorErrorDetails[retryAfterSeconds=$retryAfterSeconds]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'retryAfterSeconds'] = this.retryAfterSeconds;
    return json;
  }

  /// Clones this instance of [DirectMessageSendQuotaErrorErrorDetails] and returns a new one where some of the
  /// properties have changed.
  DirectMessageSendQuotaErrorErrorDetails copyWith({
    int? retryAfterSeconds,
  }) =>
      DirectMessageSendQuotaErrorErrorDetails(
        retryAfterSeconds: retryAfterSeconds ?? this.retryAfterSeconds,
      );

  /// Returns a new [DirectMessageSendQuotaErrorErrorDetails] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static DirectMessageSendQuotaErrorErrorDetails? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'retryAfterSeconds'),
            'Required key "DirectMessageSendQuotaErrorErrorDetails[retryAfterSeconds]" is missing from JSON.');
        assert(json[r'retryAfterSeconds'] != null,
            'Required key "DirectMessageSendQuotaErrorErrorDetails[retryAfterSeconds]" has a null value in JSON.');
        return true;
      }());

      return DirectMessageSendQuotaErrorErrorDetails(
        retryAfterSeconds: mapValueOfType<int>(json, r'retryAfterSeconds')!,
      );
    }
    return null;
  }

  static List<DirectMessageSendQuotaErrorErrorDetails> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <DirectMessageSendQuotaErrorErrorDetails>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = DirectMessageSendQuotaErrorErrorDetails.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, DirectMessageSendQuotaErrorErrorDetails> mapFromJson(
      dynamic json) {
    final map = <String, DirectMessageSendQuotaErrorErrorDetails>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value =
            DirectMessageSendQuotaErrorErrorDetails.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of DirectMessageSendQuotaErrorErrorDetails-objects as value to a dart map
  static Map<String, List<DirectMessageSendQuotaErrorErrorDetails>>
      mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<DirectMessageSendQuotaErrorErrorDetails>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = DirectMessageSendQuotaErrorErrorDetails.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'retryAfterSeconds',
  };
}

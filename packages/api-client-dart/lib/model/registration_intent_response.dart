//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RegistrationIntentResponse {
  /// Returns a new [RegistrationIntentResponse] instance.
  RegistrationIntentResponse({
    required this.token,
    required this.binding,
    required this.termsVersionId,
    required this.expiresAt,
  });

  final String token;

  final String binding;

  final String termsVersionId;

  final DateTime expiresAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RegistrationIntentResponse &&
          other.token == token &&
          other.binding == binding &&
          other.termsVersionId == termsVersionId &&
          other.expiresAt == expiresAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (token.hashCode) +
      (binding.hashCode) +
      (termsVersionId.hashCode) +
      (expiresAt.hashCode);

  @override
  String toString() =>
      'RegistrationIntentResponse[token=$token, binding=$binding, termsVersionId=$termsVersionId, expiresAt=$expiresAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'token'] = this.token;
    json[r'binding'] = this.binding;
    json[r'termsVersionId'] = this.termsVersionId;
    json[r'expiresAt'] = this.expiresAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [RegistrationIntentResponse] and returns a new one where some of the
  /// properties have changed.
  RegistrationIntentResponse copyWith({
    String? token,
    String? binding,
    String? termsVersionId,
    DateTime? expiresAt,
  }) =>
      RegistrationIntentResponse(
        token: token ?? this.token,
        binding: binding ?? this.binding,
        termsVersionId: termsVersionId ?? this.termsVersionId,
        expiresAt: expiresAt ?? this.expiresAt,
      );

  /// Returns a new [RegistrationIntentResponse] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RegistrationIntentResponse? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'token'),
            'Required key "RegistrationIntentResponse[token]" is missing from JSON.');
        assert(json[r'token'] != null,
            'Required key "RegistrationIntentResponse[token]" has a null value in JSON.');
        assert(json.containsKey(r'binding'),
            'Required key "RegistrationIntentResponse[binding]" is missing from JSON.');
        assert(json[r'binding'] != null,
            'Required key "RegistrationIntentResponse[binding]" has a null value in JSON.');
        assert(json.containsKey(r'termsVersionId'),
            'Required key "RegistrationIntentResponse[termsVersionId]" is missing from JSON.');
        assert(json[r'termsVersionId'] != null,
            'Required key "RegistrationIntentResponse[termsVersionId]" has a null value in JSON.');
        assert(json.containsKey(r'expiresAt'),
            'Required key "RegistrationIntentResponse[expiresAt]" is missing from JSON.');
        assert(json[r'expiresAt'] != null,
            'Required key "RegistrationIntentResponse[expiresAt]" has a null value in JSON.');
        return true;
      }());

      return RegistrationIntentResponse(
        token: mapValueOfType<String>(json, r'token')!,
        binding: mapValueOfType<String>(json, r'binding')!,
        termsVersionId: mapValueOfType<String>(json, r'termsVersionId')!,
        expiresAt: mapDateTime(json, r'expiresAt', r'')!,
      );
    }
    return null;
  }

  static List<RegistrationIntentResponse> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <RegistrationIntentResponse>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RegistrationIntentResponse.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RegistrationIntentResponse> mapFromJson(dynamic json) {
    final map = <String, RegistrationIntentResponse>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RegistrationIntentResponse.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RegistrationIntentResponse-objects as value to a dart map
  static Map<String, List<RegistrationIntentResponse>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<RegistrationIntentResponse>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RegistrationIntentResponse.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'token',
    'binding',
    'termsVersionId',
    'expiresAt',
  };
}

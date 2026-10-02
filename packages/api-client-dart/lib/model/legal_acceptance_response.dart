//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalAcceptanceResponse {
  /// Returns a new [LegalAcceptanceResponse] instance.
  LegalAcceptanceResponse({
    required this.termsVersionId,
    required this.acceptedAt,
    required this.declaredAt,
  });

  final String termsVersionId;

  final DateTime acceptedAt;

  final DateTime declaredAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LegalAcceptanceResponse &&
          other.termsVersionId == termsVersionId &&
          other.acceptedAt == acceptedAt &&
          other.declaredAt == declaredAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (termsVersionId.hashCode) + (acceptedAt.hashCode) + (declaredAt.hashCode);

  @override
  String toString() =>
      'LegalAcceptanceResponse[termsVersionId=$termsVersionId, acceptedAt=$acceptedAt, declaredAt=$declaredAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'termsVersionId'] = this.termsVersionId;
    json[r'acceptedAt'] = this.acceptedAt.toUtc().toIso8601String();
    json[r'declaredAt'] = this.declaredAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [LegalAcceptanceResponse] and returns a new one where some of the
  /// properties have changed.
  LegalAcceptanceResponse copyWith({
    String? termsVersionId,
    DateTime? acceptedAt,
    DateTime? declaredAt,
  }) =>
      LegalAcceptanceResponse(
        termsVersionId: termsVersionId ?? this.termsVersionId,
        acceptedAt: acceptedAt ?? this.acceptedAt,
        declaredAt: declaredAt ?? this.declaredAt,
      );

  /// Returns a new [LegalAcceptanceResponse] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LegalAcceptanceResponse? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'termsVersionId'),
            'Required key "LegalAcceptanceResponse[termsVersionId]" is missing from JSON.');
        assert(json[r'termsVersionId'] != null,
            'Required key "LegalAcceptanceResponse[termsVersionId]" has a null value in JSON.');
        assert(json.containsKey(r'acceptedAt'),
            'Required key "LegalAcceptanceResponse[acceptedAt]" is missing from JSON.');
        assert(json[r'acceptedAt'] != null,
            'Required key "LegalAcceptanceResponse[acceptedAt]" has a null value in JSON.');
        assert(json.containsKey(r'declaredAt'),
            'Required key "LegalAcceptanceResponse[declaredAt]" is missing from JSON.');
        assert(json[r'declaredAt'] != null,
            'Required key "LegalAcceptanceResponse[declaredAt]" has a null value in JSON.');
        return true;
      }());

      return LegalAcceptanceResponse(
        termsVersionId: mapValueOfType<String>(json, r'termsVersionId')!,
        acceptedAt: mapDateTime(json, r'acceptedAt', r'')!,
        declaredAt: mapDateTime(json, r'declaredAt', r'')!,
      );
    }
    return null;
  }

  static List<LegalAcceptanceResponse> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalAcceptanceResponse>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LegalAcceptanceResponse.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LegalAcceptanceResponse> mapFromJson(dynamic json) {
    final map = <String, LegalAcceptanceResponse>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = LegalAcceptanceResponse.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LegalAcceptanceResponse-objects as value to a dart map
  static Map<String, List<LegalAcceptanceResponse>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<LegalAcceptanceResponse>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LegalAcceptanceResponse.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'termsVersionId',
    'acceptedAt',
    'declaredAt',
  };
}

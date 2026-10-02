//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalAcceptanceRequest {
  /// Returns a new [LegalAcceptanceRequest] instance.
  LegalAcceptanceRequest({
    required this.termsVersionId,
    required this.termsContentDigest,
    required this.acceptedTermsAndDeclaredAge16,
  });

  final String termsVersionId;

  final String termsContentDigest;

  final bool acceptedTermsAndDeclaredAge16;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LegalAcceptanceRequest &&
          other.termsVersionId == termsVersionId &&
          other.termsContentDigest == termsContentDigest &&
          other.acceptedTermsAndDeclaredAge16 == acceptedTermsAndDeclaredAge16;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (termsVersionId.hashCode) +
      (termsContentDigest.hashCode) +
      (acceptedTermsAndDeclaredAge16.hashCode);

  @override
  String toString() =>
      'LegalAcceptanceRequest[termsVersionId=$termsVersionId, termsContentDigest=$termsContentDigest, acceptedTermsAndDeclaredAge16=$acceptedTermsAndDeclaredAge16]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'termsVersionId'] = this.termsVersionId;
    json[r'termsContentDigest'] = this.termsContentDigest;
    json[r'acceptedTermsAndDeclaredAge16'] = this.acceptedTermsAndDeclaredAge16;
    return json;
  }

  /// Clones this instance of [LegalAcceptanceRequest] and returns a new one where some of the
  /// properties have changed.
  LegalAcceptanceRequest copyWith({
    String? termsVersionId,
    String? termsContentDigest,
    bool? acceptedTermsAndDeclaredAge16,
  }) =>
      LegalAcceptanceRequest(
        termsVersionId: termsVersionId ?? this.termsVersionId,
        termsContentDigest: termsContentDigest ?? this.termsContentDigest,
        acceptedTermsAndDeclaredAge16:
            acceptedTermsAndDeclaredAge16 ?? this.acceptedTermsAndDeclaredAge16,
      );

  /// Returns a new [LegalAcceptanceRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LegalAcceptanceRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'termsVersionId'),
            'Required key "LegalAcceptanceRequest[termsVersionId]" is missing from JSON.');
        assert(json[r'termsVersionId'] != null,
            'Required key "LegalAcceptanceRequest[termsVersionId]" has a null value in JSON.');
        assert(json.containsKey(r'termsContentDigest'),
            'Required key "LegalAcceptanceRequest[termsContentDigest]" is missing from JSON.');
        assert(json[r'termsContentDigest'] != null,
            'Required key "LegalAcceptanceRequest[termsContentDigest]" has a null value in JSON.');
        assert(json.containsKey(r'acceptedTermsAndDeclaredAge16'),
            'Required key "LegalAcceptanceRequest[acceptedTermsAndDeclaredAge16]" is missing from JSON.');
        assert(json[r'acceptedTermsAndDeclaredAge16'] != null,
            'Required key "LegalAcceptanceRequest[acceptedTermsAndDeclaredAge16]" has a null value in JSON.');
        return true;
      }());

      return LegalAcceptanceRequest(
        termsVersionId: mapValueOfType<String>(json, r'termsVersionId')!,
        termsContentDigest:
            mapValueOfType<String>(json, r'termsContentDigest')!,
        acceptedTermsAndDeclaredAge16:
            mapValueOfType<bool>(json, r'acceptedTermsAndDeclaredAge16')!,
      );
    }
    return null;
  }

  static List<LegalAcceptanceRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalAcceptanceRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LegalAcceptanceRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LegalAcceptanceRequest> mapFromJson(dynamic json) {
    final map = <String, LegalAcceptanceRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = LegalAcceptanceRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LegalAcceptanceRequest-objects as value to a dart map
  static Map<String, List<LegalAcceptanceRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<LegalAcceptanceRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LegalAcceptanceRequest.listFromJson(
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
    'termsContentDigest',
    'acceptedTermsAndDeclaredAge16',
  };
}

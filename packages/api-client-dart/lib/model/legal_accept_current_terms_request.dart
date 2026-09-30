//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalAcceptCurrentTermsRequest {
  /// Returns a new [LegalAcceptCurrentTermsRequest] instance.
  LegalAcceptCurrentTermsRequest({
    required this.acceptTerms,
    required this.declareAge16OrOlder,
    required this.termsVersionId,
    required this.contentDigest,
  });

  final bool acceptTerms;

  final bool declareAge16OrOlder;

  final String termsVersionId;

  final String contentDigest;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LegalAcceptCurrentTermsRequest &&
          other.acceptTerms == acceptTerms &&
          other.declareAge16OrOlder == declareAge16OrOlder &&
          other.termsVersionId == termsVersionId &&
          other.contentDigest == contentDigest;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (acceptTerms.hashCode) +
      (declareAge16OrOlder.hashCode) +
      (termsVersionId.hashCode) +
      (contentDigest.hashCode);

  @override
  String toString() =>
      'LegalAcceptCurrentTermsRequest[acceptTerms=$acceptTerms, declareAge16OrOlder=$declareAge16OrOlder, termsVersionId=$termsVersionId, contentDigest=$contentDigest]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'acceptTerms'] = this.acceptTerms;
    json[r'declareAge16OrOlder'] = this.declareAge16OrOlder;
    json[r'termsVersionId'] = this.termsVersionId;
    json[r'contentDigest'] = this.contentDigest;
    return json;
  }

  /// Clones this instance of [LegalAcceptCurrentTermsRequest] and returns a new one where some of the
  /// properties have changed.
  LegalAcceptCurrentTermsRequest copyWith({
    bool? acceptTerms,
    bool? declareAge16OrOlder,
    String? termsVersionId,
    String? contentDigest,
  }) =>
      LegalAcceptCurrentTermsRequest(
        acceptTerms: acceptTerms ?? this.acceptTerms,
        declareAge16OrOlder: declareAge16OrOlder ?? this.declareAge16OrOlder,
        termsVersionId: termsVersionId ?? this.termsVersionId,
        contentDigest: contentDigest ?? this.contentDigest,
      );

  /// Returns a new [LegalAcceptCurrentTermsRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LegalAcceptCurrentTermsRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'acceptTerms'),
            'Required key "LegalAcceptCurrentTermsRequest[acceptTerms]" is missing from JSON.');
        assert(json[r'acceptTerms'] != null,
            'Required key "LegalAcceptCurrentTermsRequest[acceptTerms]" has a null value in JSON.');
        assert(json.containsKey(r'declareAge16OrOlder'),
            'Required key "LegalAcceptCurrentTermsRequest[declareAge16OrOlder]" is missing from JSON.');
        assert(json[r'declareAge16OrOlder'] != null,
            'Required key "LegalAcceptCurrentTermsRequest[declareAge16OrOlder]" has a null value in JSON.');
        assert(json.containsKey(r'termsVersionId'),
            'Required key "LegalAcceptCurrentTermsRequest[termsVersionId]" is missing from JSON.');
        assert(json[r'termsVersionId'] != null,
            'Required key "LegalAcceptCurrentTermsRequest[termsVersionId]" has a null value in JSON.');
        assert(json.containsKey(r'contentDigest'),
            'Required key "LegalAcceptCurrentTermsRequest[contentDigest]" is missing from JSON.');
        assert(json[r'contentDigest'] != null,
            'Required key "LegalAcceptCurrentTermsRequest[contentDigest]" has a null value in JSON.');
        return true;
      }());

      return LegalAcceptCurrentTermsRequest(
        acceptTerms: mapValueOfType<bool>(json, r'acceptTerms')!,
        declareAge16OrOlder:
            mapValueOfType<bool>(json, r'declareAge16OrOlder')!,
        termsVersionId: mapValueOfType<String>(json, r'termsVersionId')!,
        contentDigest: mapValueOfType<String>(json, r'contentDigest')!,
      );
    }
    return null;
  }

  static List<LegalAcceptCurrentTermsRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalAcceptCurrentTermsRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LegalAcceptCurrentTermsRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LegalAcceptCurrentTermsRequest> mapFromJson(dynamic json) {
    final map = <String, LegalAcceptCurrentTermsRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = LegalAcceptCurrentTermsRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LegalAcceptCurrentTermsRequest-objects as value to a dart map
  static Map<String, List<LegalAcceptCurrentTermsRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<LegalAcceptCurrentTermsRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LegalAcceptCurrentTermsRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'acceptTerms',
    'declareAge16OrOlder',
    'termsVersionId',
    'contentDigest',
  };
}

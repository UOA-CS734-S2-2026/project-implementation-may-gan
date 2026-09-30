//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalGetCurrentTermsContent200Response {
  /// Returns a new [LegalGetCurrentTermsContent200Response] instance.
  LegalGetCurrentTermsContent200Response({
    required this.terms,
    required this.canonicalContent,
  });

  final LegalGetCurrentTermsContent200ResponseTerms terms;

  final String canonicalContent;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LegalGetCurrentTermsContent200Response &&
          other.terms == terms &&
          other.canonicalContent == canonicalContent;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (terms.hashCode) + (canonicalContent.hashCode);

  @override
  String toString() =>
      'LegalGetCurrentTermsContent200Response[terms=$terms, canonicalContent=$canonicalContent]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'terms'] = this.terms;
    json[r'canonicalContent'] = this.canonicalContent;
    return json;
  }

  /// Clones this instance of [LegalGetCurrentTermsContent200Response] and returns a new one where some of the
  /// properties have changed.
  LegalGetCurrentTermsContent200Response copyWith({
    LegalGetCurrentTermsContent200ResponseTerms? terms,
    String? canonicalContent,
  }) =>
      LegalGetCurrentTermsContent200Response(
        terms: terms ?? this.terms,
        canonicalContent: canonicalContent ?? this.canonicalContent,
      );

  /// Returns a new [LegalGetCurrentTermsContent200Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LegalGetCurrentTermsContent200Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'terms'),
            'Required key "LegalGetCurrentTermsContent200Response[terms]" is missing from JSON.');
        assert(json[r'terms'] != null,
            'Required key "LegalGetCurrentTermsContent200Response[terms]" has a null value in JSON.');
        assert(json.containsKey(r'canonicalContent'),
            'Required key "LegalGetCurrentTermsContent200Response[canonicalContent]" is missing from JSON.');
        assert(json[r'canonicalContent'] != null,
            'Required key "LegalGetCurrentTermsContent200Response[canonicalContent]" has a null value in JSON.');
        return true;
      }());

      return LegalGetCurrentTermsContent200Response(
        terms: LegalGetCurrentTermsContent200ResponseTerms.fromJson(
            json[r'terms'])!,
        canonicalContent: mapValueOfType<String>(json, r'canonicalContent')!,
      );
    }
    return null;
  }

  static List<LegalGetCurrentTermsContent200Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalGetCurrentTermsContent200Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LegalGetCurrentTermsContent200Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LegalGetCurrentTermsContent200Response> mapFromJson(
      dynamic json) {
    final map = <String, LegalGetCurrentTermsContent200Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value =
            LegalGetCurrentTermsContent200Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LegalGetCurrentTermsContent200Response-objects as value to a dart map
  static Map<String, List<LegalGetCurrentTermsContent200Response>>
      mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<LegalGetCurrentTermsContent200Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LegalGetCurrentTermsContent200Response.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'terms',
    'canonicalContent',
  };
}

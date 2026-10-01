//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalGetTermsNotice200Response {
  /// Returns a new [LegalGetTermsNotice200Response] instance.
  LegalGetTermsNotice200Response({
    required this.notice,
  });

  final LegalGetTermsNotice200ResponseNotice notice;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LegalGetTermsNotice200Response && other.notice == notice;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (notice.hashCode);

  @override
  String toString() => 'LegalGetTermsNotice200Response[notice=$notice]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'notice'] = this.notice;
    return json;
  }

  /// Clones this instance of [LegalGetTermsNotice200Response] and returns a new one where some of the
  /// properties have changed.
  LegalGetTermsNotice200Response copyWith({
    LegalGetTermsNotice200ResponseNotice? notice,
  }) =>
      LegalGetTermsNotice200Response(
        notice: notice ?? this.notice,
      );

  /// Returns a new [LegalGetTermsNotice200Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LegalGetTermsNotice200Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'notice'),
            'Required key "LegalGetTermsNotice200Response[notice]" is missing from JSON.');
        assert(json[r'notice'] != null,
            'Required key "LegalGetTermsNotice200Response[notice]" has a null value in JSON.');
        return true;
      }());

      return LegalGetTermsNotice200Response(
        notice: LegalGetTermsNotice200ResponseNotice.fromJson(json[r'notice'])!,
      );
    }
    return null;
  }

  static List<LegalGetTermsNotice200Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalGetTermsNotice200Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LegalGetTermsNotice200Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LegalGetTermsNotice200Response> mapFromJson(dynamic json) {
    final map = <String, LegalGetTermsNotice200Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = LegalGetTermsNotice200Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LegalGetTermsNotice200Response-objects as value to a dart map
  static Map<String, List<LegalGetTermsNotice200Response>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<LegalGetTermsNotice200Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LegalGetTermsNotice200Response.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'notice',
  };
}

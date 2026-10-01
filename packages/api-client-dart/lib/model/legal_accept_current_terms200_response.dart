//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalAcceptCurrentTerms200Response {
  /// Returns a new [LegalAcceptCurrentTerms200Response] instance.
  LegalAcceptCurrentTerms200Response({
    required this.terms,
    required this.ageDeclarationVersion,
  });

  final LegalIssueRegistrationIntent201ResponseTerms terms;

  final LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum
      ageDeclarationVersion;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LegalAcceptCurrentTerms200Response &&
          other.terms == terms &&
          other.ageDeclarationVersion == ageDeclarationVersion;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (terms.hashCode) + (ageDeclarationVersion.hashCode);

  @override
  String toString() =>
      'LegalAcceptCurrentTerms200Response[terms=$terms, ageDeclarationVersion=$ageDeclarationVersion]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'terms'] = this.terms;
    json[r'ageDeclarationVersion'] = this.ageDeclarationVersion;
    return json;
  }

  /// Clones this instance of [LegalAcceptCurrentTerms200Response] and returns a new one where some of the
  /// properties have changed.
  LegalAcceptCurrentTerms200Response copyWith({
    LegalIssueRegistrationIntent201ResponseTerms? terms,
    LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum?
        ageDeclarationVersion,
  }) =>
      LegalAcceptCurrentTerms200Response(
        terms: terms ?? this.terms,
        ageDeclarationVersion:
            ageDeclarationVersion ?? this.ageDeclarationVersion,
      );

  /// Returns a new [LegalAcceptCurrentTerms200Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LegalAcceptCurrentTerms200Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'terms'),
            'Required key "LegalAcceptCurrentTerms200Response[terms]" is missing from JSON.');
        assert(json[r'terms'] != null,
            'Required key "LegalAcceptCurrentTerms200Response[terms]" has a null value in JSON.');
        assert(json.containsKey(r'ageDeclarationVersion'),
            'Required key "LegalAcceptCurrentTerms200Response[ageDeclarationVersion]" is missing from JSON.');
        assert(json[r'ageDeclarationVersion'] != null,
            'Required key "LegalAcceptCurrentTerms200Response[ageDeclarationVersion]" has a null value in JSON.');
        return true;
      }());

      return LegalAcceptCurrentTerms200Response(
        terms: LegalIssueRegistrationIntent201ResponseTerms.fromJson(
            json[r'terms'])!,
        ageDeclarationVersion:
            LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum
                .fromJson(json[r'ageDeclarationVersion'])!,
      );
    }
    return null;
  }

  static List<LegalAcceptCurrentTerms200Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalAcceptCurrentTerms200Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LegalAcceptCurrentTerms200Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LegalAcceptCurrentTerms200Response> mapFromJson(
      dynamic json) {
    final map = <String, LegalAcceptCurrentTerms200Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = LegalAcceptCurrentTerms200Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LegalAcceptCurrentTerms200Response-objects as value to a dart map
  static Map<String, List<LegalAcceptCurrentTerms200Response>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<LegalAcceptCurrentTerms200Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LegalAcceptCurrentTerms200Response.listFromJson(
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
    'ageDeclarationVersion',
  };
}

enum LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum {
  age16V1._(r'age-16-v1'),
  ;

  /// Instantiate a new enum with the provided value.
  const LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum._(
      this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum? fromJson(
          dynamic value) =>
      LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum>
      listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result =
        <LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum
                .fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum] to String,
/// and [decode] dynamic data back to [LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum].
class LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnumTypeTransformer {
  factory LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnumTypeTransformer() =>
      _instance ??=
          const LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnumTypeTransformer
              ._();

  const LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnumTypeTransformer._();

  String encode(
          LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum data) =>
      data._value;

  /// Returns the instance of [LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum? decode(
      dynamic data,
      {bool allowNull = true}) {
    if (data is LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'age-16-v1':
          return LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnum
              .age16V1;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static LegalAcceptCurrentTerms200ResponseAgeDeclarationVersionEnumTypeTransformer?
      _instance;
}

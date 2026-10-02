//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CurrentLegalRegistrationTerms {
  /// Returns a new [CurrentLegalRegistrationTerms] instance.
  CurrentLegalRegistrationTerms({
    required this.status,
    required this.termsVersionId,
    required this.termsContentDigest,
    required this.ageDeclarationVersion,
  });

  final CurrentLegalRegistrationTermsStatusEnum status;

  final String termsVersionId;

  final String termsContentDigest;

  final String ageDeclarationVersion;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CurrentLegalRegistrationTerms &&
          other.status == status &&
          other.termsVersionId == termsVersionId &&
          other.termsContentDigest == termsContentDigest &&
          other.ageDeclarationVersion == ageDeclarationVersion;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (status.hashCode) +
      (termsVersionId.hashCode) +
      (termsContentDigest.hashCode) +
      (ageDeclarationVersion.hashCode);

  @override
  String toString() =>
      'CurrentLegalRegistrationTerms[status=$status, termsVersionId=$termsVersionId, termsContentDigest=$termsContentDigest, ageDeclarationVersion=$ageDeclarationVersion]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'status'] = this.status;
    json[r'termsVersionId'] = this.termsVersionId;
    json[r'termsContentDigest'] = this.termsContentDigest;
    json[r'ageDeclarationVersion'] = this.ageDeclarationVersion;
    return json;
  }

  /// Clones this instance of [CurrentLegalRegistrationTerms] and returns a new one where some of the
  /// properties have changed.
  CurrentLegalRegistrationTerms copyWith({
    CurrentLegalRegistrationTermsStatusEnum? status,
    String? termsVersionId,
    String? termsContentDigest,
    String? ageDeclarationVersion,
  }) =>
      CurrentLegalRegistrationTerms(
        status: status ?? this.status,
        termsVersionId: termsVersionId ?? this.termsVersionId,
        termsContentDigest: termsContentDigest ?? this.termsContentDigest,
        ageDeclarationVersion:
            ageDeclarationVersion ?? this.ageDeclarationVersion,
      );

  /// Returns a new [CurrentLegalRegistrationTerms] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CurrentLegalRegistrationTerms? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'status'),
            'Required key "CurrentLegalRegistrationTerms[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "CurrentLegalRegistrationTerms[status]" has a null value in JSON.');
        assert(json.containsKey(r'termsVersionId'),
            'Required key "CurrentLegalRegistrationTerms[termsVersionId]" is missing from JSON.');
        assert(json[r'termsVersionId'] != null,
            'Required key "CurrentLegalRegistrationTerms[termsVersionId]" has a null value in JSON.');
        assert(json.containsKey(r'termsContentDigest'),
            'Required key "CurrentLegalRegistrationTerms[termsContentDigest]" is missing from JSON.');
        assert(json[r'termsContentDigest'] != null,
            'Required key "CurrentLegalRegistrationTerms[termsContentDigest]" has a null value in JSON.');
        assert(json.containsKey(r'ageDeclarationVersion'),
            'Required key "CurrentLegalRegistrationTerms[ageDeclarationVersion]" is missing from JSON.');
        assert(json[r'ageDeclarationVersion'] != null,
            'Required key "CurrentLegalRegistrationTerms[ageDeclarationVersion]" has a null value in JSON.');
        return true;
      }());

      return CurrentLegalRegistrationTerms(
        status:
            CurrentLegalRegistrationTermsStatusEnum.fromJson(json[r'status'])!,
        termsVersionId: mapValueOfType<String>(json, r'termsVersionId')!,
        termsContentDigest:
            mapValueOfType<String>(json, r'termsContentDigest')!,
        ageDeclarationVersion:
            mapValueOfType<String>(json, r'ageDeclarationVersion')!,
      );
    }
    return null;
  }

  static List<CurrentLegalRegistrationTerms> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <CurrentLegalRegistrationTerms>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CurrentLegalRegistrationTerms.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CurrentLegalRegistrationTerms> mapFromJson(dynamic json) {
    final map = <String, CurrentLegalRegistrationTerms>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CurrentLegalRegistrationTerms.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CurrentLegalRegistrationTerms-objects as value to a dart map
  static Map<String, List<CurrentLegalRegistrationTerms>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<CurrentLegalRegistrationTerms>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CurrentLegalRegistrationTerms.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'status',
    'termsVersionId',
    'termsContentDigest',
    'ageDeclarationVersion',
  };
}

enum CurrentLegalRegistrationTermsStatusEnum {
  unavailable._(r'unavailable'),
  effective._(r'effective'),
  ;

  /// Instantiate a new enum with the provided value.
  const CurrentLegalRegistrationTermsStatusEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [CurrentLegalRegistrationTermsStatusEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static CurrentLegalRegistrationTermsStatusEnum? fromJson(dynamic value) =>
      CurrentLegalRegistrationTermsStatusEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [CurrentLegalRegistrationTermsStatusEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<CurrentLegalRegistrationTermsStatusEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <CurrentLegalRegistrationTermsStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CurrentLegalRegistrationTermsStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [CurrentLegalRegistrationTermsStatusEnum] to String,
/// and [decode] dynamic data back to [CurrentLegalRegistrationTermsStatusEnum].
class CurrentLegalRegistrationTermsStatusEnumTypeTransformer {
  factory CurrentLegalRegistrationTermsStatusEnumTypeTransformer() =>
      _instance ??=
          const CurrentLegalRegistrationTermsStatusEnumTypeTransformer._();

  const CurrentLegalRegistrationTermsStatusEnumTypeTransformer._();

  String encode(CurrentLegalRegistrationTermsStatusEnum data) => data._value;

  /// Returns the instance of [CurrentLegalRegistrationTermsStatusEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  CurrentLegalRegistrationTermsStatusEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is CurrentLegalRegistrationTermsStatusEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'unavailable':
          return CurrentLegalRegistrationTermsStatusEnum.unavailable;
        case r'effective':
          return CurrentLegalRegistrationTermsStatusEnum.effective;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static CurrentLegalRegistrationTermsStatusEnumTypeTransformer? _instance;
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalIssueRegistrationIntent201Response {
  /// Returns a new [LegalIssueRegistrationIntent201Response] instance.
  LegalIssueRegistrationIntent201Response({
    required this.intent,
    required this.flowBinding,
    required this.expiresAt,
    required this.terms,
    required this.ageDeclarationVersion,
  });

  final String intent;

  final String flowBinding;

  final DateTime expiresAt;

  final LegalIssueRegistrationIntent201ResponseTerms terms;

  final LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum
      ageDeclarationVersion;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LegalIssueRegistrationIntent201Response &&
          other.intent == intent &&
          other.flowBinding == flowBinding &&
          other.expiresAt == expiresAt &&
          other.terms == terms &&
          other.ageDeclarationVersion == ageDeclarationVersion;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (intent.hashCode) +
      (flowBinding.hashCode) +
      (expiresAt.hashCode) +
      (terms.hashCode) +
      (ageDeclarationVersion.hashCode);

  @override
  String toString() =>
      'LegalIssueRegistrationIntent201Response[intent=$intent, flowBinding=$flowBinding, expiresAt=$expiresAt, terms=$terms, ageDeclarationVersion=$ageDeclarationVersion]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'intent'] = this.intent;
    json[r'flowBinding'] = this.flowBinding;
    json[r'expiresAt'] = this.expiresAt.toUtc().toIso8601String();
    json[r'terms'] = this.terms;
    json[r'ageDeclarationVersion'] = this.ageDeclarationVersion;
    return json;
  }

  /// Clones this instance of [LegalIssueRegistrationIntent201Response] and returns a new one where some of the
  /// properties have changed.
  LegalIssueRegistrationIntent201Response copyWith({
    String? intent,
    String? flowBinding,
    DateTime? expiresAt,
    LegalIssueRegistrationIntent201ResponseTerms? terms,
    LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum?
        ageDeclarationVersion,
  }) =>
      LegalIssueRegistrationIntent201Response(
        intent: intent ?? this.intent,
        flowBinding: flowBinding ?? this.flowBinding,
        expiresAt: expiresAt ?? this.expiresAt,
        terms: terms ?? this.terms,
        ageDeclarationVersion:
            ageDeclarationVersion ?? this.ageDeclarationVersion,
      );

  /// Returns a new [LegalIssueRegistrationIntent201Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LegalIssueRegistrationIntent201Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'intent'),
            'Required key "LegalIssueRegistrationIntent201Response[intent]" is missing from JSON.');
        assert(json[r'intent'] != null,
            'Required key "LegalIssueRegistrationIntent201Response[intent]" has a null value in JSON.');
        assert(json.containsKey(r'flowBinding'),
            'Required key "LegalIssueRegistrationIntent201Response[flowBinding]" is missing from JSON.');
        assert(json[r'flowBinding'] != null,
            'Required key "LegalIssueRegistrationIntent201Response[flowBinding]" has a null value in JSON.');
        assert(json.containsKey(r'expiresAt'),
            'Required key "LegalIssueRegistrationIntent201Response[expiresAt]" is missing from JSON.');
        assert(json[r'expiresAt'] != null,
            'Required key "LegalIssueRegistrationIntent201Response[expiresAt]" has a null value in JSON.');
        assert(json.containsKey(r'terms'),
            'Required key "LegalIssueRegistrationIntent201Response[terms]" is missing from JSON.');
        assert(json[r'terms'] != null,
            'Required key "LegalIssueRegistrationIntent201Response[terms]" has a null value in JSON.');
        assert(json.containsKey(r'ageDeclarationVersion'),
            'Required key "LegalIssueRegistrationIntent201Response[ageDeclarationVersion]" is missing from JSON.');
        assert(json[r'ageDeclarationVersion'] != null,
            'Required key "LegalIssueRegistrationIntent201Response[ageDeclarationVersion]" has a null value in JSON.');
        return true;
      }());

      return LegalIssueRegistrationIntent201Response(
        intent: mapValueOfType<String>(json, r'intent')!,
        flowBinding: mapValueOfType<String>(json, r'flowBinding')!,
        expiresAt: mapDateTime(json, r'expiresAt', r'')!,
        terms: LegalIssueRegistrationIntent201ResponseTerms.fromJson(
            json[r'terms'])!,
        ageDeclarationVersion:
            LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum
                .fromJson(json[r'ageDeclarationVersion'])!,
      );
    }
    return null;
  }

  static List<LegalIssueRegistrationIntent201Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalIssueRegistrationIntent201Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LegalIssueRegistrationIntent201Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LegalIssueRegistrationIntent201Response> mapFromJson(
      dynamic json) {
    final map = <String, LegalIssueRegistrationIntent201Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value =
            LegalIssueRegistrationIntent201Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LegalIssueRegistrationIntent201Response-objects as value to a dart map
  static Map<String, List<LegalIssueRegistrationIntent201Response>>
      mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<LegalIssueRegistrationIntent201Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LegalIssueRegistrationIntent201Response.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'intent',
    'flowBinding',
    'expiresAt',
    'terms',
    'ageDeclarationVersion',
  };
}

enum LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum {
  age16V1._(r'age-16-v1'),
  ;

  /// Instantiate a new enum with the provided value.
  const LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum._(
      this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum? fromJson(
          dynamic value) =>
      LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum>
      listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result =
        <LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum
                .fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum] to String,
/// and [decode] dynamic data back to [LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum].
class LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnumTypeTransformer {
  factory LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnumTypeTransformer() =>
      _instance ??=
          const LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnumTypeTransformer
              ._();

  const LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnumTypeTransformer._();

  String encode(
          LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum
              data) =>
      data._value;

  /// Returns the instance of [LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum? decode(
      dynamic data,
      {bool allowNull = true}) {
    if (data
        is LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'age-16-v1':
          return LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnum
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
  static LegalIssueRegistrationIntent201ResponseAgeDeclarationVersionEnumTypeTransformer?
      _instance;
}

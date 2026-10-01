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

  final LegalAcceptCurrentTermsRequestAcceptTermsEnum acceptTerms;

  final LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum
      declareAge16OrOlder;

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
    LegalAcceptCurrentTermsRequestAcceptTermsEnum? acceptTerms,
    LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum? declareAge16OrOlder,
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
        acceptTerms: LegalAcceptCurrentTermsRequestAcceptTermsEnum.fromJson(
            json[r'acceptTerms'])!,
        declareAge16OrOlder:
            LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum.fromJson(
                json[r'declareAge16OrOlder'])!,
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

enum LegalAcceptCurrentTermsRequestAcceptTermsEnum {
  true_._('true'),
  ;

  /// Instantiate a new enum with the provided value.
  const LegalAcceptCurrentTermsRequestAcceptTermsEnum._(this._value);

  /// The underlying value of this enum member.
  final bool _value;

  @override
  String toString() => _value.toString();

  /// Encodes this enum as a value suitable for JSON.
  bool toJson() => _value;

  /// Returns the instance of [LegalAcceptCurrentTermsRequestAcceptTermsEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static LegalAcceptCurrentTermsRequestAcceptTermsEnum? fromJson(
          dynamic value) =>
      LegalAcceptCurrentTermsRequestAcceptTermsEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [LegalAcceptCurrentTermsRequestAcceptTermsEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<LegalAcceptCurrentTermsRequestAcceptTermsEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalAcceptCurrentTermsRequestAcceptTermsEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            LegalAcceptCurrentTermsRequestAcceptTermsEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LegalAcceptCurrentTermsRequestAcceptTermsEnum] to bool,
/// and [decode] dynamic data back to [LegalAcceptCurrentTermsRequestAcceptTermsEnum].
class LegalAcceptCurrentTermsRequestAcceptTermsEnumTypeTransformer {
  factory LegalAcceptCurrentTermsRequestAcceptTermsEnumTypeTransformer() =>
      _instance ??=
          const LegalAcceptCurrentTermsRequestAcceptTermsEnumTypeTransformer
              ._();

  const LegalAcceptCurrentTermsRequestAcceptTermsEnumTypeTransformer._();

  bool encode(LegalAcceptCurrentTermsRequestAcceptTermsEnum data) =>
      data._value;

  /// Returns the instance of [LegalAcceptCurrentTermsRequestAcceptTermsEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LegalAcceptCurrentTermsRequestAcceptTermsEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is LegalAcceptCurrentTermsRequestAcceptTermsEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case 'true':
          return LegalAcceptCurrentTermsRequestAcceptTermsEnum.true_;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static LegalAcceptCurrentTermsRequestAcceptTermsEnumTypeTransformer?
      _instance;
}

enum LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum {
  true_._('true'),
  ;

  /// Instantiate a new enum with the provided value.
  const LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum._(this._value);

  /// The underlying value of this enum member.
  final bool _value;

  @override
  String toString() => _value.toString();

  /// Encodes this enum as a value suitable for JSON.
  bool toJson() => _value;

  /// Returns the instance of [LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum? fromJson(
          dynamic value) =>
      LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum>
      listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum] to bool,
/// and [decode] dynamic data back to [LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum].
class LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnumTypeTransformer {
  factory LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnumTypeTransformer() =>
      _instance ??=
          const LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnumTypeTransformer
              ._();

  const LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnumTypeTransformer._();

  bool encode(LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum data) =>
      data._value;

  /// Returns the instance of [LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case 'true':
          return LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnum.true_;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static LegalAcceptCurrentTermsRequestDeclareAge16OrOlderEnumTypeTransformer?
      _instance;
}

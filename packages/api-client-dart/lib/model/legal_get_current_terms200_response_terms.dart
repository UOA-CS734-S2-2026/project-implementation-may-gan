//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalGetCurrentTerms200ResponseTerms {
  /// Returns a new [LegalGetCurrentTerms200ResponseTerms] instance.
  LegalGetCurrentTerms200ResponseTerms({
    required this.id,
    required this.version,
    required this.contentDigest,
    required this.status,
    required this.effectiveAt,
    required this.documentUrl,
  });

  final String id;

  /// Minimum value: 0
  final int version;

  final String contentDigest;

  final LegalGetCurrentTerms200ResponseTermsStatusEnum status;

  final DateTime effectiveAt;

  final LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum documentUrl;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LegalGetCurrentTerms200ResponseTerms &&
          other.id == id &&
          other.version == version &&
          other.contentDigest == contentDigest &&
          other.status == status &&
          other.effectiveAt == effectiveAt &&
          other.documentUrl == documentUrl;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (version.hashCode) +
      (contentDigest.hashCode) +
      (status.hashCode) +
      (effectiveAt.hashCode) +
      (documentUrl.hashCode);

  @override
  String toString() =>
      'LegalGetCurrentTerms200ResponseTerms[id=$id, version=$version, contentDigest=$contentDigest, status=$status, effectiveAt=$effectiveAt, documentUrl=$documentUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'version'] = this.version;
    json[r'contentDigest'] = this.contentDigest;
    json[r'status'] = this.status;
    json[r'effectiveAt'] = this.effectiveAt.toUtc().toIso8601String();
    json[r'documentUrl'] = this.documentUrl;
    return json;
  }

  /// Clones this instance of [LegalGetCurrentTerms200ResponseTerms] and returns a new one where some of the
  /// properties have changed.
  LegalGetCurrentTerms200ResponseTerms copyWith({
    String? id,
    int? version,
    String? contentDigest,
    LegalGetCurrentTerms200ResponseTermsStatusEnum? status,
    DateTime? effectiveAt,
    LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum? documentUrl,
  }) =>
      LegalGetCurrentTerms200ResponseTerms(
        id: id ?? this.id,
        version: version ?? this.version,
        contentDigest: contentDigest ?? this.contentDigest,
        status: status ?? this.status,
        effectiveAt: effectiveAt ?? this.effectiveAt,
        documentUrl: documentUrl ?? this.documentUrl,
      );

  /// Returns a new [LegalGetCurrentTerms200ResponseTerms] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LegalGetCurrentTerms200ResponseTerms? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "LegalGetCurrentTerms200ResponseTerms[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "LegalGetCurrentTerms200ResponseTerms[id]" has a null value in JSON.');
        assert(json.containsKey(r'version'),
            'Required key "LegalGetCurrentTerms200ResponseTerms[version]" is missing from JSON.');
        assert(json[r'version'] != null,
            'Required key "LegalGetCurrentTerms200ResponseTerms[version]" has a null value in JSON.');
        assert(json.containsKey(r'contentDigest'),
            'Required key "LegalGetCurrentTerms200ResponseTerms[contentDigest]" is missing from JSON.');
        assert(json[r'contentDigest'] != null,
            'Required key "LegalGetCurrentTerms200ResponseTerms[contentDigest]" has a null value in JSON.');
        assert(json.containsKey(r'status'),
            'Required key "LegalGetCurrentTerms200ResponseTerms[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "LegalGetCurrentTerms200ResponseTerms[status]" has a null value in JSON.');
        assert(json.containsKey(r'effectiveAt'),
            'Required key "LegalGetCurrentTerms200ResponseTerms[effectiveAt]" is missing from JSON.');
        assert(json[r'effectiveAt'] != null,
            'Required key "LegalGetCurrentTerms200ResponseTerms[effectiveAt]" has a null value in JSON.');
        assert(json.containsKey(r'documentUrl'),
            'Required key "LegalGetCurrentTerms200ResponseTerms[documentUrl]" is missing from JSON.');
        assert(json[r'documentUrl'] != null,
            'Required key "LegalGetCurrentTerms200ResponseTerms[documentUrl]" has a null value in JSON.');
        return true;
      }());

      return LegalGetCurrentTerms200ResponseTerms(
        id: mapValueOfType<String>(json, r'id')!,
        version: mapValueOfType<int>(json, r'version')!,
        contentDigest: mapValueOfType<String>(json, r'contentDigest')!,
        status: LegalGetCurrentTerms200ResponseTermsStatusEnum.fromJson(
            json[r'status'])!,
        effectiveAt: mapDateTime(json, r'effectiveAt', r'')!,
        documentUrl:
            LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum.fromJson(
                json[r'documentUrl'])!,
      );
    }
    return null;
  }

  static List<LegalGetCurrentTerms200ResponseTerms> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalGetCurrentTerms200ResponseTerms>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LegalGetCurrentTerms200ResponseTerms.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LegalGetCurrentTerms200ResponseTerms> mapFromJson(
      dynamic json) {
    final map = <String, LegalGetCurrentTerms200ResponseTerms>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value =
            LegalGetCurrentTerms200ResponseTerms.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LegalGetCurrentTerms200ResponseTerms-objects as value to a dart map
  static Map<String, List<LegalGetCurrentTerms200ResponseTerms>>
      mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<LegalGetCurrentTerms200ResponseTerms>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LegalGetCurrentTerms200ResponseTerms.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'version',
    'contentDigest',
    'status',
    'effectiveAt',
    'documentUrl',
  };
}

enum LegalGetCurrentTerms200ResponseTermsStatusEnum {
  effective._(r'effective'),
  ;

  /// Instantiate a new enum with the provided value.
  const LegalGetCurrentTerms200ResponseTermsStatusEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [LegalGetCurrentTerms200ResponseTermsStatusEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static LegalGetCurrentTerms200ResponseTermsStatusEnum? fromJson(
          dynamic value) =>
      LegalGetCurrentTerms200ResponseTermsStatusEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [LegalGetCurrentTerms200ResponseTermsStatusEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<LegalGetCurrentTerms200ResponseTermsStatusEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalGetCurrentTerms200ResponseTermsStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            LegalGetCurrentTerms200ResponseTermsStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LegalGetCurrentTerms200ResponseTermsStatusEnum] to String,
/// and [decode] dynamic data back to [LegalGetCurrentTerms200ResponseTermsStatusEnum].
class LegalGetCurrentTerms200ResponseTermsStatusEnumTypeTransformer {
  factory LegalGetCurrentTerms200ResponseTermsStatusEnumTypeTransformer() =>
      _instance ??=
          const LegalGetCurrentTerms200ResponseTermsStatusEnumTypeTransformer
              ._();

  const LegalGetCurrentTerms200ResponseTermsStatusEnumTypeTransformer._();

  String encode(LegalGetCurrentTerms200ResponseTermsStatusEnum data) =>
      data._value;

  /// Returns the instance of [LegalGetCurrentTerms200ResponseTermsStatusEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LegalGetCurrentTerms200ResponseTermsStatusEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is LegalGetCurrentTerms200ResponseTermsStatusEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'effective':
          return LegalGetCurrentTerms200ResponseTermsStatusEnum.effective;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static LegalGetCurrentTerms200ResponseTermsStatusEnumTypeTransformer?
      _instance;
}

enum LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum {
  slashTerms._(r'/terms'),
  ;

  /// Instantiate a new enum with the provided value.
  const LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum? fromJson(
          dynamic value) =>
      LegalGetCurrentTerms200ResponseTermsDocumentUrlEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum] to String,
/// and [decode] dynamic data back to [LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum].
class LegalGetCurrentTerms200ResponseTermsDocumentUrlEnumTypeTransformer {
  factory LegalGetCurrentTerms200ResponseTermsDocumentUrlEnumTypeTransformer() =>
      _instance ??=
          const LegalGetCurrentTerms200ResponseTermsDocumentUrlEnumTypeTransformer
              ._();

  const LegalGetCurrentTerms200ResponseTermsDocumentUrlEnumTypeTransformer._();

  String encode(LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum data) =>
      data._value;

  /// Returns the instance of [LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'/terms':
          return LegalGetCurrentTerms200ResponseTermsDocumentUrlEnum.slashTerms;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static LegalGetCurrentTerms200ResponseTermsDocumentUrlEnumTypeTransformer?
      _instance;
}

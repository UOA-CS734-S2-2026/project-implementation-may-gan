//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalGetCurrentTermsContent200ResponseTerms {
  /// Returns a new [LegalGetCurrentTermsContent200ResponseTerms] instance.
  LegalGetCurrentTermsContent200ResponseTerms({
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

  final LegalGetCurrentTermsContent200ResponseTermsStatusEnum status;

  final DateTime effectiveAt;

  final LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum documentUrl;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LegalGetCurrentTermsContent200ResponseTerms &&
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
      'LegalGetCurrentTermsContent200ResponseTerms[id=$id, version=$version, contentDigest=$contentDigest, status=$status, effectiveAt=$effectiveAt, documentUrl=$documentUrl]';

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

  /// Clones this instance of [LegalGetCurrentTermsContent200ResponseTerms] and returns a new one where some of the
  /// properties have changed.
  LegalGetCurrentTermsContent200ResponseTerms copyWith({
    String? id,
    int? version,
    String? contentDigest,
    LegalGetCurrentTermsContent200ResponseTermsStatusEnum? status,
    DateTime? effectiveAt,
    LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum? documentUrl,
  }) =>
      LegalGetCurrentTermsContent200ResponseTerms(
        id: id ?? this.id,
        version: version ?? this.version,
        contentDigest: contentDigest ?? this.contentDigest,
        status: status ?? this.status,
        effectiveAt: effectiveAt ?? this.effectiveAt,
        documentUrl: documentUrl ?? this.documentUrl,
      );

  /// Returns a new [LegalGetCurrentTermsContent200ResponseTerms] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LegalGetCurrentTermsContent200ResponseTerms? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "LegalGetCurrentTermsContent200ResponseTerms[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "LegalGetCurrentTermsContent200ResponseTerms[id]" has a null value in JSON.');
        assert(json.containsKey(r'version'),
            'Required key "LegalGetCurrentTermsContent200ResponseTerms[version]" is missing from JSON.');
        assert(json[r'version'] != null,
            'Required key "LegalGetCurrentTermsContent200ResponseTerms[version]" has a null value in JSON.');
        assert(json.containsKey(r'contentDigest'),
            'Required key "LegalGetCurrentTermsContent200ResponseTerms[contentDigest]" is missing from JSON.');
        assert(json[r'contentDigest'] != null,
            'Required key "LegalGetCurrentTermsContent200ResponseTerms[contentDigest]" has a null value in JSON.');
        assert(json.containsKey(r'status'),
            'Required key "LegalGetCurrentTermsContent200ResponseTerms[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "LegalGetCurrentTermsContent200ResponseTerms[status]" has a null value in JSON.');
        assert(json.containsKey(r'effectiveAt'),
            'Required key "LegalGetCurrentTermsContent200ResponseTerms[effectiveAt]" is missing from JSON.');
        assert(json[r'effectiveAt'] != null,
            'Required key "LegalGetCurrentTermsContent200ResponseTerms[effectiveAt]" has a null value in JSON.');
        assert(json.containsKey(r'documentUrl'),
            'Required key "LegalGetCurrentTermsContent200ResponseTerms[documentUrl]" is missing from JSON.');
        assert(json[r'documentUrl'] != null,
            'Required key "LegalGetCurrentTermsContent200ResponseTerms[documentUrl]" has a null value in JSON.');
        return true;
      }());

      return LegalGetCurrentTermsContent200ResponseTerms(
        id: mapValueOfType<String>(json, r'id')!,
        version: mapValueOfType<int>(json, r'version')!,
        contentDigest: mapValueOfType<String>(json, r'contentDigest')!,
        status: LegalGetCurrentTermsContent200ResponseTermsStatusEnum.fromJson(
            json[r'status'])!,
        effectiveAt: mapDateTime(json, r'effectiveAt', r'')!,
        documentUrl:
            LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum.fromJson(
                json[r'documentUrl'])!,
      );
    }
    return null;
  }

  static List<LegalGetCurrentTermsContent200ResponseTerms> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalGetCurrentTermsContent200ResponseTerms>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LegalGetCurrentTermsContent200ResponseTerms.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LegalGetCurrentTermsContent200ResponseTerms> mapFromJson(
      dynamic json) {
    final map = <String, LegalGetCurrentTermsContent200ResponseTerms>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value =
            LegalGetCurrentTermsContent200ResponseTerms.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LegalGetCurrentTermsContent200ResponseTerms-objects as value to a dart map
  static Map<String, List<LegalGetCurrentTermsContent200ResponseTerms>>
      mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<LegalGetCurrentTermsContent200ResponseTerms>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] =
            LegalGetCurrentTermsContent200ResponseTerms.listFromJson(
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

enum LegalGetCurrentTermsContent200ResponseTermsStatusEnum {
  effective._(r'effective'),
  ;

  /// Instantiate a new enum with the provided value.
  const LegalGetCurrentTermsContent200ResponseTermsStatusEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [LegalGetCurrentTermsContent200ResponseTermsStatusEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static LegalGetCurrentTermsContent200ResponseTermsStatusEnum? fromJson(
          dynamic value) =>
      LegalGetCurrentTermsContent200ResponseTermsStatusEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [LegalGetCurrentTermsContent200ResponseTermsStatusEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<LegalGetCurrentTermsContent200ResponseTermsStatusEnum>
      listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalGetCurrentTermsContent200ResponseTermsStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            LegalGetCurrentTermsContent200ResponseTermsStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LegalGetCurrentTermsContent200ResponseTermsStatusEnum] to String,
/// and [decode] dynamic data back to [LegalGetCurrentTermsContent200ResponseTermsStatusEnum].
class LegalGetCurrentTermsContent200ResponseTermsStatusEnumTypeTransformer {
  factory LegalGetCurrentTermsContent200ResponseTermsStatusEnumTypeTransformer() =>
      _instance ??=
          const LegalGetCurrentTermsContent200ResponseTermsStatusEnumTypeTransformer
              ._();

  const LegalGetCurrentTermsContent200ResponseTermsStatusEnumTypeTransformer._();

  String encode(LegalGetCurrentTermsContent200ResponseTermsStatusEnum data) =>
      data._value;

  /// Returns the instance of [LegalGetCurrentTermsContent200ResponseTermsStatusEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LegalGetCurrentTermsContent200ResponseTermsStatusEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is LegalGetCurrentTermsContent200ResponseTermsStatusEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'effective':
          return LegalGetCurrentTermsContent200ResponseTermsStatusEnum
              .effective;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static LegalGetCurrentTermsContent200ResponseTermsStatusEnumTypeTransformer?
      _instance;
}

enum LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum {
  slashApiSlashV1SlashLegalSlashTermsSlashCurrentSlashContent._(
      r'/api/v1/legal/terms/current/content'),
  ;

  /// Instantiate a new enum with the provided value.
  const LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum._(
      this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum? fromJson(
          dynamic value) =>
      LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum>
      listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result =
        <LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum.fromJson(
                row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum] to String,
/// and [decode] dynamic data back to [LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum].
class LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnumTypeTransformer {
  factory LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnumTypeTransformer() =>
      _instance ??=
          const LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnumTypeTransformer
              ._();

  const LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnumTypeTransformer._();

  String encode(
          LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum data) =>
      data._value;

  /// Returns the instance of [LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum? decode(
      dynamic data,
      {bool allowNull = true}) {
    if (data is LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'/api/v1/legal/terms/current/content':
          return LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnum
              .slashApiSlashV1SlashLegalSlashTermsSlashCurrentSlashContent;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static LegalGetCurrentTermsContent200ResponseTermsDocumentUrlEnumTypeTransformer?
      _instance;
}

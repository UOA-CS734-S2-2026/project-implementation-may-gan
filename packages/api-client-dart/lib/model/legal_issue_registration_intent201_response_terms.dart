//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalIssueRegistrationIntent201ResponseTerms {
  /// Returns a new [LegalIssueRegistrationIntent201ResponseTerms] instance.
  LegalIssueRegistrationIntent201ResponseTerms({
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

  final LegalIssueRegistrationIntent201ResponseTermsStatusEnum status;

  final DateTime effectiveAt;

  final LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum documentUrl;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LegalIssueRegistrationIntent201ResponseTerms &&
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
      'LegalIssueRegistrationIntent201ResponseTerms[id=$id, version=$version, contentDigest=$contentDigest, status=$status, effectiveAt=$effectiveAt, documentUrl=$documentUrl]';

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

  /// Clones this instance of [LegalIssueRegistrationIntent201ResponseTerms] and returns a new one where some of the
  /// properties have changed.
  LegalIssueRegistrationIntent201ResponseTerms copyWith({
    String? id,
    int? version,
    String? contentDigest,
    LegalIssueRegistrationIntent201ResponseTermsStatusEnum? status,
    DateTime? effectiveAt,
    LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum? documentUrl,
  }) =>
      LegalIssueRegistrationIntent201ResponseTerms(
        id: id ?? this.id,
        version: version ?? this.version,
        contentDigest: contentDigest ?? this.contentDigest,
        status: status ?? this.status,
        effectiveAt: effectiveAt ?? this.effectiveAt,
        documentUrl: documentUrl ?? this.documentUrl,
      );

  /// Returns a new [LegalIssueRegistrationIntent201ResponseTerms] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LegalIssueRegistrationIntent201ResponseTerms? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "LegalIssueRegistrationIntent201ResponseTerms[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "LegalIssueRegistrationIntent201ResponseTerms[id]" has a null value in JSON.');
        assert(json.containsKey(r'version'),
            'Required key "LegalIssueRegistrationIntent201ResponseTerms[version]" is missing from JSON.');
        assert(json[r'version'] != null,
            'Required key "LegalIssueRegistrationIntent201ResponseTerms[version]" has a null value in JSON.');
        assert(json.containsKey(r'contentDigest'),
            'Required key "LegalIssueRegistrationIntent201ResponseTerms[contentDigest]" is missing from JSON.');
        assert(json[r'contentDigest'] != null,
            'Required key "LegalIssueRegistrationIntent201ResponseTerms[contentDigest]" has a null value in JSON.');
        assert(json.containsKey(r'status'),
            'Required key "LegalIssueRegistrationIntent201ResponseTerms[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "LegalIssueRegistrationIntent201ResponseTerms[status]" has a null value in JSON.');
        assert(json.containsKey(r'effectiveAt'),
            'Required key "LegalIssueRegistrationIntent201ResponseTerms[effectiveAt]" is missing from JSON.');
        assert(json[r'effectiveAt'] != null,
            'Required key "LegalIssueRegistrationIntent201ResponseTerms[effectiveAt]" has a null value in JSON.');
        assert(json.containsKey(r'documentUrl'),
            'Required key "LegalIssueRegistrationIntent201ResponseTerms[documentUrl]" is missing from JSON.');
        assert(json[r'documentUrl'] != null,
            'Required key "LegalIssueRegistrationIntent201ResponseTerms[documentUrl]" has a null value in JSON.');
        return true;
      }());

      return LegalIssueRegistrationIntent201ResponseTerms(
        id: mapValueOfType<String>(json, r'id')!,
        version: mapValueOfType<int>(json, r'version')!,
        contentDigest: mapValueOfType<String>(json, r'contentDigest')!,
        status: LegalIssueRegistrationIntent201ResponseTermsStatusEnum.fromJson(
            json[r'status'])!,
        effectiveAt: mapDateTime(json, r'effectiveAt', r'')!,
        documentUrl: LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum
            .fromJson(json[r'documentUrl'])!,
      );
    }
    return null;
  }

  static List<LegalIssueRegistrationIntent201ResponseTerms> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalIssueRegistrationIntent201ResponseTerms>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            LegalIssueRegistrationIntent201ResponseTerms.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LegalIssueRegistrationIntent201ResponseTerms> mapFromJson(
      dynamic json) {
    final map = <String, LegalIssueRegistrationIntent201ResponseTerms>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value =
            LegalIssueRegistrationIntent201ResponseTerms.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LegalIssueRegistrationIntent201ResponseTerms-objects as value to a dart map
  static Map<String, List<LegalIssueRegistrationIntent201ResponseTerms>>
      mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<LegalIssueRegistrationIntent201ResponseTerms>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] =
            LegalIssueRegistrationIntent201ResponseTerms.listFromJson(
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

enum LegalIssueRegistrationIntent201ResponseTermsStatusEnum {
  effective._(r'effective'),
  ;

  /// Instantiate a new enum with the provided value.
  const LegalIssueRegistrationIntent201ResponseTermsStatusEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [LegalIssueRegistrationIntent201ResponseTermsStatusEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static LegalIssueRegistrationIntent201ResponseTermsStatusEnum? fromJson(
          dynamic value) =>
      LegalIssueRegistrationIntent201ResponseTermsStatusEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [LegalIssueRegistrationIntent201ResponseTermsStatusEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<LegalIssueRegistrationIntent201ResponseTermsStatusEnum>
      listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalIssueRegistrationIntent201ResponseTermsStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            LegalIssueRegistrationIntent201ResponseTermsStatusEnum.fromJson(
                row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LegalIssueRegistrationIntent201ResponseTermsStatusEnum] to String,
/// and [decode] dynamic data back to [LegalIssueRegistrationIntent201ResponseTermsStatusEnum].
class LegalIssueRegistrationIntent201ResponseTermsStatusEnumTypeTransformer {
  factory LegalIssueRegistrationIntent201ResponseTermsStatusEnumTypeTransformer() =>
      _instance ??=
          const LegalIssueRegistrationIntent201ResponseTermsStatusEnumTypeTransformer
              ._();

  const LegalIssueRegistrationIntent201ResponseTermsStatusEnumTypeTransformer._();

  String encode(LegalIssueRegistrationIntent201ResponseTermsStatusEnum data) =>
      data._value;

  /// Returns the instance of [LegalIssueRegistrationIntent201ResponseTermsStatusEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LegalIssueRegistrationIntent201ResponseTermsStatusEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is LegalIssueRegistrationIntent201ResponseTermsStatusEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'effective':
          return LegalIssueRegistrationIntent201ResponseTermsStatusEnum
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
  static LegalIssueRegistrationIntent201ResponseTermsStatusEnumTypeTransformer?
      _instance;
}

enum LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum {
  slashApiSlashV1SlashLegalSlashTermsSlashCurrentSlashContent._(
      r'/api/v1/legal/terms/current/content'),
  ;

  /// Instantiate a new enum with the provided value.
  const LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum._(
      this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum? fromJson(
          dynamic value) =>
      LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum>
      listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result =
        <LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum
                .fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum] to String,
/// and [decode] dynamic data back to [LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum].
class LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnumTypeTransformer {
  factory LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnumTypeTransformer() =>
      _instance ??=
          const LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnumTypeTransformer
              ._();

  const LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnumTypeTransformer._();

  String encode(
          LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum data) =>
      data._value;

  /// Returns the instance of [LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum? decode(
      dynamic data,
      {bool allowNull = true}) {
    if (data is LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'/api/v1/legal/terms/current/content':
          return LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnum
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
  static LegalIssueRegistrationIntent201ResponseTermsDocumentUrlEnumTypeTransformer?
      _instance;
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalGetTermsNotice200ResponseNotice {
  /// Returns a new [LegalGetTermsNotice200ResponseNotice] instance.
  LegalGetTermsNotice200ResponseNotice({
    required this.id,
    required this.version,
    required this.contentDigest,
    required this.materialChange,
    required this.noticeStartsAt,
    required this.effectiveAt,
    required this.urgentChangeReason,
    required this.documentUrl,
  });

  final String id;

  /// Minimum value: 0
  final int version;

  final String contentDigest;

  final bool materialChange;

  final DateTime noticeStartsAt;

  final DateTime effectiveAt;

  final String urgentChangeReason;

  final LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum documentUrl;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LegalGetTermsNotice200ResponseNotice &&
          other.id == id &&
          other.version == version &&
          other.contentDigest == contentDigest &&
          other.materialChange == materialChange &&
          other.noticeStartsAt == noticeStartsAt &&
          other.effectiveAt == effectiveAt &&
          other.urgentChangeReason == urgentChangeReason &&
          other.documentUrl == documentUrl;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (version.hashCode) +
      (contentDigest.hashCode) +
      (materialChange.hashCode) +
      (noticeStartsAt.hashCode) +
      (effectiveAt.hashCode) +
      (urgentChangeReason.hashCode) +
      (documentUrl.hashCode);

  @override
  String toString() =>
      'LegalGetTermsNotice200ResponseNotice[id=$id, version=$version, contentDigest=$contentDigest, materialChange=$materialChange, noticeStartsAt=$noticeStartsAt, effectiveAt=$effectiveAt, urgentChangeReason=$urgentChangeReason, documentUrl=$documentUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'version'] = this.version;
    json[r'contentDigest'] = this.contentDigest;
    json[r'materialChange'] = this.materialChange;
    json[r'noticeStartsAt'] = this.noticeStartsAt.toUtc().toIso8601String();
    json[r'effectiveAt'] = this.effectiveAt.toUtc().toIso8601String();
    json[r'urgentChangeReason'] = this.urgentChangeReason;
    json[r'documentUrl'] = this.documentUrl;
    return json;
  }

  /// Clones this instance of [LegalGetTermsNotice200ResponseNotice] and returns a new one where some of the
  /// properties have changed.
  LegalGetTermsNotice200ResponseNotice copyWith({
    String? id,
    int? version,
    String? contentDigest,
    bool? materialChange,
    DateTime? noticeStartsAt,
    DateTime? effectiveAt,
    String? urgentChangeReason,
    LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum? documentUrl,
  }) =>
      LegalGetTermsNotice200ResponseNotice(
        id: id ?? this.id,
        version: version ?? this.version,
        contentDigest: contentDigest ?? this.contentDigest,
        materialChange: materialChange ?? this.materialChange,
        noticeStartsAt: noticeStartsAt ?? this.noticeStartsAt,
        effectiveAt: effectiveAt ?? this.effectiveAt,
        urgentChangeReason: urgentChangeReason ?? this.urgentChangeReason,
        documentUrl: documentUrl ?? this.documentUrl,
      );

  /// Returns a new [LegalGetTermsNotice200ResponseNotice] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LegalGetTermsNotice200ResponseNotice? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "LegalGetTermsNotice200ResponseNotice[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "LegalGetTermsNotice200ResponseNotice[id]" has a null value in JSON.');
        assert(json.containsKey(r'version'),
            'Required key "LegalGetTermsNotice200ResponseNotice[version]" is missing from JSON.');
        assert(json[r'version'] != null,
            'Required key "LegalGetTermsNotice200ResponseNotice[version]" has a null value in JSON.');
        assert(json.containsKey(r'contentDigest'),
            'Required key "LegalGetTermsNotice200ResponseNotice[contentDigest]" is missing from JSON.');
        assert(json[r'contentDigest'] != null,
            'Required key "LegalGetTermsNotice200ResponseNotice[contentDigest]" has a null value in JSON.');
        assert(json.containsKey(r'materialChange'),
            'Required key "LegalGetTermsNotice200ResponseNotice[materialChange]" is missing from JSON.');
        assert(json[r'materialChange'] != null,
            'Required key "LegalGetTermsNotice200ResponseNotice[materialChange]" has a null value in JSON.');
        assert(json.containsKey(r'noticeStartsAt'),
            'Required key "LegalGetTermsNotice200ResponseNotice[noticeStartsAt]" is missing from JSON.');
        assert(json[r'noticeStartsAt'] != null,
            'Required key "LegalGetTermsNotice200ResponseNotice[noticeStartsAt]" has a null value in JSON.');
        assert(json.containsKey(r'effectiveAt'),
            'Required key "LegalGetTermsNotice200ResponseNotice[effectiveAt]" is missing from JSON.');
        assert(json[r'effectiveAt'] != null,
            'Required key "LegalGetTermsNotice200ResponseNotice[effectiveAt]" has a null value in JSON.');
        assert(json.containsKey(r'urgentChangeReason'),
            'Required key "LegalGetTermsNotice200ResponseNotice[urgentChangeReason]" is missing from JSON.');
        assert(json[r'urgentChangeReason'] != null,
            'Required key "LegalGetTermsNotice200ResponseNotice[urgentChangeReason]" has a null value in JSON.');
        assert(json.containsKey(r'documentUrl'),
            'Required key "LegalGetTermsNotice200ResponseNotice[documentUrl]" is missing from JSON.');
        assert(json[r'documentUrl'] != null,
            'Required key "LegalGetTermsNotice200ResponseNotice[documentUrl]" has a null value in JSON.');
        return true;
      }());

      return LegalGetTermsNotice200ResponseNotice(
        id: mapValueOfType<String>(json, r'id')!,
        version: mapValueOfType<int>(json, r'version')!,
        contentDigest: mapValueOfType<String>(json, r'contentDigest')!,
        materialChange: mapValueOfType<bool>(json, r'materialChange')!,
        noticeStartsAt: mapDateTime(json, r'noticeStartsAt', r'')!,
        effectiveAt: mapDateTime(json, r'effectiveAt', r'')!,
        urgentChangeReason:
            mapValueOfType<String>(json, r'urgentChangeReason')!,
        documentUrl:
            LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum.fromJson(
                json[r'documentUrl'])!,
      );
    }
    return null;
  }

  static List<LegalGetTermsNotice200ResponseNotice> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalGetTermsNotice200ResponseNotice>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LegalGetTermsNotice200ResponseNotice.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LegalGetTermsNotice200ResponseNotice> mapFromJson(
      dynamic json) {
    final map = <String, LegalGetTermsNotice200ResponseNotice>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value =
            LegalGetTermsNotice200ResponseNotice.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LegalGetTermsNotice200ResponseNotice-objects as value to a dart map
  static Map<String, List<LegalGetTermsNotice200ResponseNotice>>
      mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<LegalGetTermsNotice200ResponseNotice>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LegalGetTermsNotice200ResponseNotice.listFromJson(
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
    'materialChange',
    'noticeStartsAt',
    'effectiveAt',
    'urgentChangeReason',
    'documentUrl',
  };
}

enum LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum {
  slashApiSlashV1SlashLegalSlashTermsSlashCurrentSlashContent._(
      r'/api/v1/legal/terms/current/content'),
  ;

  /// Instantiate a new enum with the provided value.
  const LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum? fromJson(
          dynamic value) =>
      LegalGetTermsNotice200ResponseNoticeDocumentUrlEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum] to String,
/// and [decode] dynamic data back to [LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum].
class LegalGetTermsNotice200ResponseNoticeDocumentUrlEnumTypeTransformer {
  factory LegalGetTermsNotice200ResponseNoticeDocumentUrlEnumTypeTransformer() =>
      _instance ??=
          const LegalGetTermsNotice200ResponseNoticeDocumentUrlEnumTypeTransformer
              ._();

  const LegalGetTermsNotice200ResponseNoticeDocumentUrlEnumTypeTransformer._();

  String encode(LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum data) =>
      data._value;

  /// Returns the instance of [LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'/api/v1/legal/terms/current/content':
          return LegalGetTermsNotice200ResponseNoticeDocumentUrlEnum
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
  static LegalGetTermsNotice200ResponseNoticeDocumentUrlEnumTypeTransformer?
      _instance;
}

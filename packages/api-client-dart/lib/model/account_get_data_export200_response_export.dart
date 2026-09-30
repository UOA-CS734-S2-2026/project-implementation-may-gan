//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountGetDataExport200ResponseExport {
  /// Returns a new [AccountGetDataExport200ResponseExport] instance.
  AccountGetDataExport200ResponseExport({
    required this.id,
    required this.status,
    required this.requestedAt,
    required this.readyAt,
    required this.expiresAt,
    required this.downloadable,
  });

  final String id;

  final AccountGetDataExport200ResponseExportStatusEnum status;

  final DateTime requestedAt;

  final DateTime? readyAt;

  final DateTime? expiresAt;

  final bool downloadable;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountGetDataExport200ResponseExport &&
          other.id == id &&
          other.status == status &&
          other.requestedAt == requestedAt &&
          other.readyAt == readyAt &&
          other.expiresAt == expiresAt &&
          other.downloadable == downloadable;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (status.hashCode) +
      (requestedAt.hashCode) +
      (readyAt.hashCode) +
      (expiresAt.hashCode) +
      (downloadable.hashCode);

  @override
  String toString() =>
      'AccountGetDataExport200ResponseExport[id=$id, status=$status, requestedAt=$requestedAt, readyAt=$readyAt, expiresAt=$expiresAt, downloadable=$downloadable]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'status'] = this.status;
    json[r'requestedAt'] = this.requestedAt.toUtc().toIso8601String();
    json[r'readyAt'] =
        this.readyAt == null ? null : this.readyAt!.toUtc().toIso8601String();
    json[r'expiresAt'] = this.expiresAt == null
        ? null
        : this.expiresAt!.toUtc().toIso8601String();
    json[r'downloadable'] = this.downloadable;
    return json;
  }

  /// Clones this instance of [AccountGetDataExport200ResponseExport] and returns a new one where some of the
  /// properties have changed.
  AccountGetDataExport200ResponseExport copyWith({
    String? id,
    AccountGetDataExport200ResponseExportStatusEnum? status,
    DateTime? requestedAt,
    DateTime? readyAt,
    DateTime? expiresAt,
    bool? downloadable,
  }) =>
      AccountGetDataExport200ResponseExport(
        id: id ?? this.id,
        status: status ?? this.status,
        requestedAt: requestedAt ?? this.requestedAt,
        readyAt: readyAt ?? this.readyAt,
        expiresAt: expiresAt ?? this.expiresAt,
        downloadable: downloadable ?? this.downloadable,
      );

  /// Returns a new [AccountGetDataExport200ResponseExport] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountGetDataExport200ResponseExport? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "AccountGetDataExport200ResponseExport[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "AccountGetDataExport200ResponseExport[id]" has a null value in JSON.');
        assert(json.containsKey(r'status'),
            'Required key "AccountGetDataExport200ResponseExport[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "AccountGetDataExport200ResponseExport[status]" has a null value in JSON.');
        assert(json.containsKey(r'requestedAt'),
            'Required key "AccountGetDataExport200ResponseExport[requestedAt]" is missing from JSON.');
        assert(json[r'requestedAt'] != null,
            'Required key "AccountGetDataExport200ResponseExport[requestedAt]" has a null value in JSON.');
        assert(json.containsKey(r'readyAt'),
            'Required key "AccountGetDataExport200ResponseExport[readyAt]" is missing from JSON.');
        assert(json.containsKey(r'expiresAt'),
            'Required key "AccountGetDataExport200ResponseExport[expiresAt]" is missing from JSON.');
        assert(json.containsKey(r'downloadable'),
            'Required key "AccountGetDataExport200ResponseExport[downloadable]" is missing from JSON.');
        assert(json[r'downloadable'] != null,
            'Required key "AccountGetDataExport200ResponseExport[downloadable]" has a null value in JSON.');
        return true;
      }());

      return AccountGetDataExport200ResponseExport(
        id: mapValueOfType<String>(json, r'id')!,
        status: AccountGetDataExport200ResponseExportStatusEnum.fromJson(
            json[r'status'])!,
        requestedAt: mapDateTime(json, r'requestedAt', r'')!,
        readyAt: mapDateTime(json, r'readyAt', r''),
        expiresAt: mapDateTime(json, r'expiresAt', r''),
        downloadable: mapValueOfType<bool>(json, r'downloadable')!,
      );
    }
    return null;
  }

  static List<AccountGetDataExport200ResponseExport> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountGetDataExport200ResponseExport>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountGetDataExport200ResponseExport.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountGetDataExport200ResponseExport> mapFromJson(
      dynamic json) {
    final map = <String, AccountGetDataExport200ResponseExport>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value =
            AccountGetDataExport200ResponseExport.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountGetDataExport200ResponseExport-objects as value to a dart map
  static Map<String, List<AccountGetDataExport200ResponseExport>>
      mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountGetDataExport200ResponseExport>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountGetDataExport200ResponseExport.listFromJson(
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
    'status',
    'requestedAt',
    'readyAt',
    'expiresAt',
    'downloadable',
  };
}

enum AccountGetDataExport200ResponseExportStatusEnum {
  requested._(r'requested'),
  building._(r'building'),
  ready._(r'ready'),
  failed._(r'failed'),
  cancelled._(r'cancelled'),
  expired._(r'expired'),
  ;

  /// Instantiate a new enum with the provided value.
  const AccountGetDataExport200ResponseExportStatusEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [AccountGetDataExport200ResponseExportStatusEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static AccountGetDataExport200ResponseExportStatusEnum? fromJson(
          dynamic value) =>
      AccountGetDataExport200ResponseExportStatusEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [AccountGetDataExport200ResponseExportStatusEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<AccountGetDataExport200ResponseExportStatusEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountGetDataExport200ResponseExportStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            AccountGetDataExport200ResponseExportStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AccountGetDataExport200ResponseExportStatusEnum] to String,
/// and [decode] dynamic data back to [AccountGetDataExport200ResponseExportStatusEnum].
class AccountGetDataExport200ResponseExportStatusEnumTypeTransformer {
  factory AccountGetDataExport200ResponseExportStatusEnumTypeTransformer() =>
      _instance ??=
          const AccountGetDataExport200ResponseExportStatusEnumTypeTransformer
              ._();

  const AccountGetDataExport200ResponseExportStatusEnumTypeTransformer._();

  String encode(AccountGetDataExport200ResponseExportStatusEnum data) =>
      data._value;

  /// Returns the instance of [AccountGetDataExport200ResponseExportStatusEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AccountGetDataExport200ResponseExportStatusEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is AccountGetDataExport200ResponseExportStatusEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'requested':
          return AccountGetDataExport200ResponseExportStatusEnum.requested;
        case r'building':
          return AccountGetDataExport200ResponseExportStatusEnum.building;
        case r'ready':
          return AccountGetDataExport200ResponseExportStatusEnum.ready;
        case r'failed':
          return AccountGetDataExport200ResponseExportStatusEnum.failed;
        case r'cancelled':
          return AccountGetDataExport200ResponseExportStatusEnum.cancelled;
        case r'expired':
          return AccountGetDataExport200ResponseExportStatusEnum.expired;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static AccountGetDataExport200ResponseExportStatusEnumTypeTransformer?
      _instance;
}

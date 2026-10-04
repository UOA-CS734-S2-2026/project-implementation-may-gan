//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountExportStatus {
  /// Returns a new [AccountExportStatus] instance.
  AccountExportStatus({
    required this.requestId,
    required this.status,
    required this.requestedAt,
    required this.readyAt,
    required this.expiresAt,
  });

  final String? requestId;

  final AccountExportStatusStatusEnum status;

  final DateTime? requestedAt;

  final DateTime? readyAt;

  final DateTime? expiresAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountExportStatus &&
          other.requestId == requestId &&
          other.status == status &&
          other.requestedAt == requestedAt &&
          other.readyAt == readyAt &&
          other.expiresAt == expiresAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (requestId == null ? 0 : requestId!.hashCode) +
      (status.hashCode) +
      (requestedAt == null ? 0 : requestedAt!.hashCode) +
      (readyAt == null ? 0 : readyAt!.hashCode) +
      (expiresAt == null ? 0 : expiresAt!.hashCode);

  @override
  String toString() =>
      'AccountExportStatus[requestId=$requestId, status=$status, requestedAt=$requestedAt, readyAt=$readyAt, expiresAt=$expiresAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.requestId != null) {
      json[r'requestId'] = this.requestId;
    } else {
      json[r'requestId'] = null;
    }
    json[r'status'] = this.status;
    if (this.requestedAt != null) {
      json[r'requestedAt'] = this.requestedAt!.toUtc().toIso8601String();
    } else {
      json[r'requestedAt'] = null;
    }
    if (this.readyAt != null) {
      json[r'readyAt'] = this.readyAt!.toUtc().toIso8601String();
    } else {
      json[r'readyAt'] = null;
    }
    if (this.expiresAt != null) {
      json[r'expiresAt'] = this.expiresAt!.toUtc().toIso8601String();
    } else {
      json[r'expiresAt'] = null;
    }
    return json;
  }

  /// Clones this instance of [AccountExportStatus] and returns a new one where some of the
  /// properties have changed.
  AccountExportStatus copyWith({
    String? requestId,
    bool requestIdSetToNull = false,
    AccountExportStatusStatusEnum? status,
    DateTime? requestedAt,
    bool requestedAtSetToNull = false,
    DateTime? readyAt,
    bool readyAtSetToNull = false,
    DateTime? expiresAt,
    bool expiresAtSetToNull = false,
  }) =>
      AccountExportStatus(
        requestId: requestIdSetToNull ? null : requestId ?? this.requestId,
        status: status ?? this.status,
        requestedAt:
            requestedAtSetToNull ? null : requestedAt ?? this.requestedAt,
        readyAt: readyAtSetToNull ? null : readyAt ?? this.readyAt,
        expiresAt: expiresAtSetToNull ? null : expiresAt ?? this.expiresAt,
      );

  /// Returns a new [AccountExportStatus] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountExportStatus? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'requestId'),
            'Required key "AccountExportStatus[requestId]" is missing from JSON.');
        assert(json.containsKey(r'status'),
            'Required key "AccountExportStatus[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "AccountExportStatus[status]" has a null value in JSON.');
        assert(json.containsKey(r'requestedAt'),
            'Required key "AccountExportStatus[requestedAt]" is missing from JSON.');
        assert(json.containsKey(r'readyAt'),
            'Required key "AccountExportStatus[readyAt]" is missing from JSON.');
        assert(json.containsKey(r'expiresAt'),
            'Required key "AccountExportStatus[expiresAt]" is missing from JSON.');
        return true;
      }());

      return AccountExportStatus(
        requestId: mapValueOfType<String>(json, r'requestId'),
        status: AccountExportStatusStatusEnum.fromJson(json[r'status'])!,
        requestedAt: mapDateTime(json, r'requestedAt', r''),
        readyAt: mapDateTime(json, r'readyAt', r''),
        expiresAt: mapDateTime(json, r'expiresAt', r''),
      );
    }
    return null;
  }

  static List<AccountExportStatus> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountExportStatus>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountExportStatus.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountExportStatus> mapFromJson(dynamic json) {
    final map = <String, AccountExportStatus>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountExportStatus.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountExportStatus-objects as value to a dart map
  static Map<String, List<AccountExportStatus>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountExportStatus>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountExportStatus.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'requestId',
    'status',
    'requestedAt',
    'readyAt',
    'expiresAt',
  };
}

enum AccountExportStatusStatusEnum {
  none._(r'none'),
  requested._(r'requested'),
  building._(r'building'),
  ready._(r'ready'),
  failed._(r'failed'),
  cancelled._(r'cancelled'),
  expired._(r'expired'),
  ;

  /// Instantiate a new enum with the provided value.
  const AccountExportStatusStatusEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [AccountExportStatusStatusEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static AccountExportStatusStatusEnum? fromJson(dynamic value) =>
      AccountExportStatusStatusEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [AccountExportStatusStatusEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<AccountExportStatusStatusEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountExportStatusStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountExportStatusStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AccountExportStatusStatusEnum] to String,
/// and [decode] dynamic data back to [AccountExportStatusStatusEnum].
class AccountExportStatusStatusEnumTypeTransformer {
  factory AccountExportStatusStatusEnumTypeTransformer() =>
      _instance ??= const AccountExportStatusStatusEnumTypeTransformer._();

  const AccountExportStatusStatusEnumTypeTransformer._();

  String encode(AccountExportStatusStatusEnum data) => data._value;

  /// Returns the instance of [AccountExportStatusStatusEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AccountExportStatusStatusEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is AccountExportStatusStatusEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'none':
          return AccountExportStatusStatusEnum.none;
        case r'requested':
          return AccountExportStatusStatusEnum.requested;
        case r'building':
          return AccountExportStatusStatusEnum.building;
        case r'ready':
          return AccountExportStatusStatusEnum.ready;
        case r'failed':
          return AccountExportStatusStatusEnum.failed;
        case r'cancelled':
          return AccountExportStatusStatusEnum.cancelled;
        case r'expired':
          return AccountExportStatusStatusEnum.expired;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static AccountExportStatusStatusEnumTypeTransformer? _instance;
}

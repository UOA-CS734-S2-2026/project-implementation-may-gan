//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountExportRequestResult {
  /// Returns a new [AccountExportRequestResult] instance.
  AccountExportRequestResult({
    required this.requestId,
    required this.status,
    required this.requestedAt,
  });

  final String requestId;

  final AccountExportRequestResultStatusEnum status;

  final DateTime requestedAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountExportRequestResult &&
          other.requestId == requestId &&
          other.status == status &&
          other.requestedAt == requestedAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (requestId.hashCode) + (status.hashCode) + (requestedAt.hashCode);

  @override
  String toString() =>
      'AccountExportRequestResult[requestId=$requestId, status=$status, requestedAt=$requestedAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'requestId'] = this.requestId;
    json[r'status'] = this.status;
    json[r'requestedAt'] = this.requestedAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [AccountExportRequestResult] and returns a new one where some of the
  /// properties have changed.
  AccountExportRequestResult copyWith({
    String? requestId,
    AccountExportRequestResultStatusEnum? status,
    DateTime? requestedAt,
  }) =>
      AccountExportRequestResult(
        requestId: requestId ?? this.requestId,
        status: status ?? this.status,
        requestedAt: requestedAt ?? this.requestedAt,
      );

  /// Returns a new [AccountExportRequestResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountExportRequestResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'requestId'),
            'Required key "AccountExportRequestResult[requestId]" is missing from JSON.');
        assert(json[r'requestId'] != null,
            'Required key "AccountExportRequestResult[requestId]" has a null value in JSON.');
        assert(json.containsKey(r'status'),
            'Required key "AccountExportRequestResult[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "AccountExportRequestResult[status]" has a null value in JSON.');
        assert(json.containsKey(r'requestedAt'),
            'Required key "AccountExportRequestResult[requestedAt]" is missing from JSON.');
        assert(json[r'requestedAt'] != null,
            'Required key "AccountExportRequestResult[requestedAt]" has a null value in JSON.');
        return true;
      }());

      return AccountExportRequestResult(
        requestId: mapValueOfType<String>(json, r'requestId')!,
        status: AccountExportRequestResultStatusEnum.fromJson(json[r'status'])!,
        requestedAt: mapDateTime(json, r'requestedAt', r'')!,
      );
    }
    return null;
  }

  static List<AccountExportRequestResult> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountExportRequestResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountExportRequestResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountExportRequestResult> mapFromJson(dynamic json) {
    final map = <String, AccountExportRequestResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountExportRequestResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountExportRequestResult-objects as value to a dart map
  static Map<String, List<AccountExportRequestResult>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountExportRequestResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountExportRequestResult.listFromJson(
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
  };
}

enum AccountExportRequestResultStatusEnum {
  requested._(r'requested'),
  building._(r'building'),
  ready._(r'ready'),
  expired._(r'expired'),
  ;

  /// Instantiate a new enum with the provided value.
  const AccountExportRequestResultStatusEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [AccountExportRequestResultStatusEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static AccountExportRequestResultStatusEnum? fromJson(dynamic value) =>
      AccountExportRequestResultStatusEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [AccountExportRequestResultStatusEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<AccountExportRequestResultStatusEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountExportRequestResultStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountExportRequestResultStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AccountExportRequestResultStatusEnum] to String,
/// and [decode] dynamic data back to [AccountExportRequestResultStatusEnum].
class AccountExportRequestResultStatusEnumTypeTransformer {
  factory AccountExportRequestResultStatusEnumTypeTransformer() => _instance ??=
      const AccountExportRequestResultStatusEnumTypeTransformer._();

  const AccountExportRequestResultStatusEnumTypeTransformer._();

  String encode(AccountExportRequestResultStatusEnum data) => data._value;

  /// Returns the instance of [AccountExportRequestResultStatusEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AccountExportRequestResultStatusEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is AccountExportRequestResultStatusEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'requested':
          return AccountExportRequestResultStatusEnum.requested;
        case r'building':
          return AccountExportRequestResultStatusEnum.building;
        case r'ready':
          return AccountExportRequestResultStatusEnum.ready;
        case r'expired':
          return AccountExportRequestResultStatusEnum.expired;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static AccountExportRequestResultStatusEnumTypeTransformer? _instance;
}

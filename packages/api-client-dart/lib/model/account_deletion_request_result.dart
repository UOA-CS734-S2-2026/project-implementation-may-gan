//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountDeletionRequestResult {
  /// Returns a new [AccountDeletionRequestResult] instance.
  AccountDeletionRequestResult({
    required this.status,
    required this.requestId,
    required this.requestedAt,
    required this.cancelUntil,
    required this.purgeDueAt,
  });

  final AccountDeletionRequestResultStatusEnum status;

  final String requestId;

  final DateTime requestedAt;

  final DateTime cancelUntil;

  final DateTime purgeDueAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountDeletionRequestResult &&
          other.status == status &&
          other.requestId == requestId &&
          other.requestedAt == requestedAt &&
          other.cancelUntil == cancelUntil &&
          other.purgeDueAt == purgeDueAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (status.hashCode) +
      (requestId.hashCode) +
      (requestedAt.hashCode) +
      (cancelUntil.hashCode) +
      (purgeDueAt.hashCode);

  @override
  String toString() =>
      'AccountDeletionRequestResult[status=$status, requestId=$requestId, requestedAt=$requestedAt, cancelUntil=$cancelUntil, purgeDueAt=$purgeDueAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'status'] = this.status;
    json[r'requestId'] = this.requestId;
    json[r'requestedAt'] = this.requestedAt.toUtc().toIso8601String();
    json[r'cancelUntil'] = this.cancelUntil.toUtc().toIso8601String();
    json[r'purgeDueAt'] = this.purgeDueAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [AccountDeletionRequestResult] and returns a new one where some of the
  /// properties have changed.
  AccountDeletionRequestResult copyWith({
    AccountDeletionRequestResultStatusEnum? status,
    String? requestId,
    DateTime? requestedAt,
    DateTime? cancelUntil,
    DateTime? purgeDueAt,
  }) =>
      AccountDeletionRequestResult(
        status: status ?? this.status,
        requestId: requestId ?? this.requestId,
        requestedAt: requestedAt ?? this.requestedAt,
        cancelUntil: cancelUntil ?? this.cancelUntil,
        purgeDueAt: purgeDueAt ?? this.purgeDueAt,
      );

  /// Returns a new [AccountDeletionRequestResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountDeletionRequestResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'status'),
            'Required key "AccountDeletionRequestResult[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "AccountDeletionRequestResult[status]" has a null value in JSON.');
        assert(json.containsKey(r'requestId'),
            'Required key "AccountDeletionRequestResult[requestId]" is missing from JSON.');
        assert(json[r'requestId'] != null,
            'Required key "AccountDeletionRequestResult[requestId]" has a null value in JSON.');
        assert(json.containsKey(r'requestedAt'),
            'Required key "AccountDeletionRequestResult[requestedAt]" is missing from JSON.');
        assert(json[r'requestedAt'] != null,
            'Required key "AccountDeletionRequestResult[requestedAt]" has a null value in JSON.');
        assert(json.containsKey(r'cancelUntil'),
            'Required key "AccountDeletionRequestResult[cancelUntil]" is missing from JSON.');
        assert(json[r'cancelUntil'] != null,
            'Required key "AccountDeletionRequestResult[cancelUntil]" has a null value in JSON.');
        assert(json.containsKey(r'purgeDueAt'),
            'Required key "AccountDeletionRequestResult[purgeDueAt]" is missing from JSON.');
        assert(json[r'purgeDueAt'] != null,
            'Required key "AccountDeletionRequestResult[purgeDueAt]" has a null value in JSON.');
        return true;
      }());

      return AccountDeletionRequestResult(
        status:
            AccountDeletionRequestResultStatusEnum.fromJson(json[r'status'])!,
        requestId: mapValueOfType<String>(json, r'requestId')!,
        requestedAt: mapDateTime(json, r'requestedAt', r'')!,
        cancelUntil: mapDateTime(json, r'cancelUntil', r'')!,
        purgeDueAt: mapDateTime(json, r'purgeDueAt', r'')!,
      );
    }
    return null;
  }

  static List<AccountDeletionRequestResult> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountDeletionRequestResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountDeletionRequestResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountDeletionRequestResult> mapFromJson(dynamic json) {
    final map = <String, AccountDeletionRequestResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountDeletionRequestResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountDeletionRequestResult-objects as value to a dart map
  static Map<String, List<AccountDeletionRequestResult>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountDeletionRequestResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountDeletionRequestResult.listFromJson(
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
    'requestId',
    'requestedAt',
    'cancelUntil',
    'purgeDueAt',
  };
}

enum AccountDeletionRequestResultStatusEnum {
  requested._(r'requested'),
  alreadyRequested._(r'already_requested'),
  ;

  /// Instantiate a new enum with the provided value.
  const AccountDeletionRequestResultStatusEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [AccountDeletionRequestResultStatusEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static AccountDeletionRequestResultStatusEnum? fromJson(dynamic value) =>
      AccountDeletionRequestResultStatusEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [AccountDeletionRequestResultStatusEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<AccountDeletionRequestResultStatusEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountDeletionRequestResultStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountDeletionRequestResultStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AccountDeletionRequestResultStatusEnum] to String,
/// and [decode] dynamic data back to [AccountDeletionRequestResultStatusEnum].
class AccountDeletionRequestResultStatusEnumTypeTransformer {
  factory AccountDeletionRequestResultStatusEnumTypeTransformer() =>
      _instance ??=
          const AccountDeletionRequestResultStatusEnumTypeTransformer._();

  const AccountDeletionRequestResultStatusEnumTypeTransformer._();

  String encode(AccountDeletionRequestResultStatusEnum data) => data._value;

  /// Returns the instance of [AccountDeletionRequestResultStatusEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AccountDeletionRequestResultStatusEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is AccountDeletionRequestResultStatusEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'requested':
          return AccountDeletionRequestResultStatusEnum.requested;
        case r'already_requested':
          return AccountDeletionRequestResultStatusEnum.alreadyRequested;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static AccountDeletionRequestResultStatusEnumTypeTransformer? _instance;
}

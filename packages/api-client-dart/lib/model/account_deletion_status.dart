//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountDeletionStatus {
  /// Returns a new [AccountDeletionStatus] instance.
  AccountDeletionStatus({
    required this.state,
    required this.generation,
    required this.requestId,
    required this.requestedAt,
    required this.cancelUntil,
    required this.purgeDueAt,
  });

  final AccountDeletionStatusStateEnum state;

  /// Minimum value: 0
  final int generation;

  final String? requestId;

  final DateTime? requestedAt;

  final DateTime? cancelUntil;

  final DateTime? purgeDueAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountDeletionStatus &&
          other.state == state &&
          other.generation == generation &&
          other.requestId == requestId &&
          other.requestedAt == requestedAt &&
          other.cancelUntil == cancelUntil &&
          other.purgeDueAt == purgeDueAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (state.hashCode) +
      (generation.hashCode) +
      (requestId == null ? 0 : requestId!.hashCode) +
      (requestedAt == null ? 0 : requestedAt!.hashCode) +
      (cancelUntil == null ? 0 : cancelUntil!.hashCode) +
      (purgeDueAt == null ? 0 : purgeDueAt!.hashCode);

  @override
  String toString() =>
      'AccountDeletionStatus[state=$state, generation=$generation, requestId=$requestId, requestedAt=$requestedAt, cancelUntil=$cancelUntil, purgeDueAt=$purgeDueAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'state'] = this.state;
    json[r'generation'] = this.generation;
    if (this.requestId != null) {
      json[r'requestId'] = this.requestId;
    } else {
      json[r'requestId'] = null;
    }
    if (this.requestedAt != null) {
      json[r'requestedAt'] = this.requestedAt!.toUtc().toIso8601String();
    } else {
      json[r'requestedAt'] = null;
    }
    if (this.cancelUntil != null) {
      json[r'cancelUntil'] = this.cancelUntil!.toUtc().toIso8601String();
    } else {
      json[r'cancelUntil'] = null;
    }
    if (this.purgeDueAt != null) {
      json[r'purgeDueAt'] = this.purgeDueAt!.toUtc().toIso8601String();
    } else {
      json[r'purgeDueAt'] = null;
    }
    return json;
  }

  /// Clones this instance of [AccountDeletionStatus] and returns a new one where some of the
  /// properties have changed.
  AccountDeletionStatus copyWith({
    AccountDeletionStatusStateEnum? state,
    int? generation,
    String? requestId,
    bool requestIdSetToNull = false,
    DateTime? requestedAt,
    bool requestedAtSetToNull = false,
    DateTime? cancelUntil,
    bool cancelUntilSetToNull = false,
    DateTime? purgeDueAt,
    bool purgeDueAtSetToNull = false,
  }) =>
      AccountDeletionStatus(
        state: state ?? this.state,
        generation: generation ?? this.generation,
        requestId: requestIdSetToNull ? null : requestId ?? this.requestId,
        requestedAt:
            requestedAtSetToNull ? null : requestedAt ?? this.requestedAt,
        cancelUntil:
            cancelUntilSetToNull ? null : cancelUntil ?? this.cancelUntil,
        purgeDueAt: purgeDueAtSetToNull ? null : purgeDueAt ?? this.purgeDueAt,
      );

  /// Returns a new [AccountDeletionStatus] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountDeletionStatus? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'state'),
            'Required key "AccountDeletionStatus[state]" is missing from JSON.');
        assert(json[r'state'] != null,
            'Required key "AccountDeletionStatus[state]" has a null value in JSON.');
        assert(json.containsKey(r'generation'),
            'Required key "AccountDeletionStatus[generation]" is missing from JSON.');
        assert(json[r'generation'] != null,
            'Required key "AccountDeletionStatus[generation]" has a null value in JSON.');
        assert(json.containsKey(r'requestId'),
            'Required key "AccountDeletionStatus[requestId]" is missing from JSON.');
        assert(json.containsKey(r'requestedAt'),
            'Required key "AccountDeletionStatus[requestedAt]" is missing from JSON.');
        assert(json.containsKey(r'cancelUntil'),
            'Required key "AccountDeletionStatus[cancelUntil]" is missing from JSON.');
        assert(json.containsKey(r'purgeDueAt'),
            'Required key "AccountDeletionStatus[purgeDueAt]" is missing from JSON.');
        return true;
      }());

      return AccountDeletionStatus(
        state: AccountDeletionStatusStateEnum.fromJson(json[r'state'])!,
        generation: mapValueOfType<int>(json, r'generation')!,
        requestId: mapValueOfType<String>(json, r'requestId'),
        requestedAt: mapDateTime(json, r'requestedAt', r''),
        cancelUntil: mapDateTime(json, r'cancelUntil', r''),
        purgeDueAt: mapDateTime(json, r'purgeDueAt', r''),
      );
    }
    return null;
  }

  static List<AccountDeletionStatus> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountDeletionStatus>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountDeletionStatus.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountDeletionStatus> mapFromJson(dynamic json) {
    final map = <String, AccountDeletionStatus>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountDeletionStatus.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountDeletionStatus-objects as value to a dart map
  static Map<String, List<AccountDeletionStatus>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountDeletionStatus>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountDeletionStatus.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'state',
    'generation',
    'requestId',
    'requestedAt',
    'cancelUntil',
    'purgeDueAt',
  };
}

enum AccountDeletionStatusStateEnum {
  active._(r'active'),
  pendingDeletion._(r'pending_deletion'),
  purging._(r'purging'),
  purgeFailed._(r'purge_failed'),
  ;

  /// Instantiate a new enum with the provided value.
  const AccountDeletionStatusStateEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [AccountDeletionStatusStateEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static AccountDeletionStatusStateEnum? fromJson(dynamic value) =>
      AccountDeletionStatusStateEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [AccountDeletionStatusStateEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<AccountDeletionStatusStateEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountDeletionStatusStateEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountDeletionStatusStateEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AccountDeletionStatusStateEnum] to String,
/// and [decode] dynamic data back to [AccountDeletionStatusStateEnum].
class AccountDeletionStatusStateEnumTypeTransformer {
  factory AccountDeletionStatusStateEnumTypeTransformer() =>
      _instance ??= const AccountDeletionStatusStateEnumTypeTransformer._();

  const AccountDeletionStatusStateEnumTypeTransformer._();

  String encode(AccountDeletionStatusStateEnum data) => data._value;

  /// Returns the instance of [AccountDeletionStatusStateEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AccountDeletionStatusStateEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is AccountDeletionStatusStateEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'active':
          return AccountDeletionStatusStateEnum.active;
        case r'pending_deletion':
          return AccountDeletionStatusStateEnum.pendingDeletion;
        case r'purging':
          return AccountDeletionStatusStateEnum.purging;
        case r'purge_failed':
          return AccountDeletionStatusStateEnum.purgeFailed;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static AccountDeletionStatusStateEnumTypeTransformer? _instance;
}

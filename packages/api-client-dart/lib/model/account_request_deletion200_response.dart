//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountRequestDeletion200Response {
  /// Returns a new [AccountRequestDeletion200Response] instance.
  AccountRequestDeletion200Response({
    required this.state,
    required this.generation,
    this.requestId,
    this.requestedAt,
    this.cancelUntil,
    this.purgeDueAt,
    required this.restrictedSession,
  });

  final AccountRequestDeletion200ResponseStateEnum state;

  /// Minimum value: 0
  final int generation;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? requestId;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final DateTime? requestedAt;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final DateTime? cancelUntil;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final DateTime? purgeDueAt;

  final AccountRequestDeletion200ResponseRestrictedSessionEnum
      restrictedSession;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountRequestDeletion200Response &&
          other.state == state &&
          other.generation == generation &&
          other.requestId == requestId &&
          other.requestedAt == requestedAt &&
          other.cancelUntil == cancelUntil &&
          other.purgeDueAt == purgeDueAt &&
          other.restrictedSession == restrictedSession;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (state.hashCode) +
      (generation.hashCode) +
      (requestId == null ? 0 : requestId!.hashCode) +
      (requestedAt == null ? 0 : requestedAt!.hashCode) +
      (cancelUntil == null ? 0 : cancelUntil!.hashCode) +
      (purgeDueAt == null ? 0 : purgeDueAt!.hashCode) +
      (restrictedSession.hashCode);

  @override
  String toString() =>
      'AccountRequestDeletion200Response[state=$state, generation=$generation, requestId=$requestId, requestedAt=$requestedAt, cancelUntil=$cancelUntil, purgeDueAt=$purgeDueAt, restrictedSession=$restrictedSession]';

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
    json[r'restrictedSession'] = this.restrictedSession;
    return json;
  }

  /// Clones this instance of [AccountRequestDeletion200Response] and returns a new one where some of the
  /// properties have changed.
  AccountRequestDeletion200Response copyWith({
    AccountRequestDeletion200ResponseStateEnum? state,
    int? generation,
    String? requestId,
    DateTime? requestedAt,
    DateTime? cancelUntil,
    DateTime? purgeDueAt,
    AccountRequestDeletion200ResponseRestrictedSessionEnum? restrictedSession,
  }) =>
      AccountRequestDeletion200Response(
        state: state ?? this.state,
        generation: generation ?? this.generation,
        requestId: requestId ?? this.requestId,
        requestedAt: requestedAt ?? this.requestedAt,
        cancelUntil: cancelUntil ?? this.cancelUntil,
        purgeDueAt: purgeDueAt ?? this.purgeDueAt,
        restrictedSession: restrictedSession ?? this.restrictedSession,
      );

  /// Returns a new [AccountRequestDeletion200Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountRequestDeletion200Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'state'),
            'Required key "AccountRequestDeletion200Response[state]" is missing from JSON.');
        assert(json[r'state'] != null,
            'Required key "AccountRequestDeletion200Response[state]" has a null value in JSON.');
        assert(json.containsKey(r'generation'),
            'Required key "AccountRequestDeletion200Response[generation]" is missing from JSON.');
        assert(json[r'generation'] != null,
            'Required key "AccountRequestDeletion200Response[generation]" has a null value in JSON.');
        assert(json.containsKey(r'restrictedSession'),
            'Required key "AccountRequestDeletion200Response[restrictedSession]" is missing from JSON.');
        assert(json[r'restrictedSession'] != null,
            'Required key "AccountRequestDeletion200Response[restrictedSession]" has a null value in JSON.');
        return true;
      }());

      return AccountRequestDeletion200Response(
        state: AccountRequestDeletion200ResponseStateEnum.fromJson(
            json[r'state'])!,
        generation: mapValueOfType<int>(json, r'generation')!,
        requestId: mapValueOfType<String>(json, r'requestId'),
        requestedAt: mapDateTime(json, r'requestedAt', r''),
        cancelUntil: mapDateTime(json, r'cancelUntil', r''),
        purgeDueAt: mapDateTime(json, r'purgeDueAt', r''),
        restrictedSession:
            AccountRequestDeletion200ResponseRestrictedSessionEnum.fromJson(
                json[r'restrictedSession'])!,
      );
    }
    return null;
  }

  static List<AccountRequestDeletion200Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountRequestDeletion200Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountRequestDeletion200Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountRequestDeletion200Response> mapFromJson(
      dynamic json) {
    final map = <String, AccountRequestDeletion200Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountRequestDeletion200Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountRequestDeletion200Response-objects as value to a dart map
  static Map<String, List<AccountRequestDeletion200Response>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountRequestDeletion200Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountRequestDeletion200Response.listFromJson(
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
    'restrictedSession',
  };
}

enum AccountRequestDeletion200ResponseStateEnum {
  active._(r'active'),
  pendingDeletion._(r'pending_deletion'),
  purging._(r'purging'),
  purgeFailed._(r'purge_failed'),
  ;

  /// Instantiate a new enum with the provided value.
  const AccountRequestDeletion200ResponseStateEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [AccountRequestDeletion200ResponseStateEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static AccountRequestDeletion200ResponseStateEnum? fromJson(dynamic value) =>
      AccountRequestDeletion200ResponseStateEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [AccountRequestDeletion200ResponseStateEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<AccountRequestDeletion200ResponseStateEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountRequestDeletion200ResponseStateEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountRequestDeletion200ResponseStateEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AccountRequestDeletion200ResponseStateEnum] to String,
/// and [decode] dynamic data back to [AccountRequestDeletion200ResponseStateEnum].
class AccountRequestDeletion200ResponseStateEnumTypeTransformer {
  factory AccountRequestDeletion200ResponseStateEnumTypeTransformer() =>
      _instance ??=
          const AccountRequestDeletion200ResponseStateEnumTypeTransformer._();

  const AccountRequestDeletion200ResponseStateEnumTypeTransformer._();

  String encode(AccountRequestDeletion200ResponseStateEnum data) => data._value;

  /// Returns the instance of [AccountRequestDeletion200ResponseStateEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AccountRequestDeletion200ResponseStateEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is AccountRequestDeletion200ResponseStateEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'active':
          return AccountRequestDeletion200ResponseStateEnum.active;
        case r'pending_deletion':
          return AccountRequestDeletion200ResponseStateEnum.pendingDeletion;
        case r'purging':
          return AccountRequestDeletion200ResponseStateEnum.purging;
        case r'purge_failed':
          return AccountRequestDeletion200ResponseStateEnum.purgeFailed;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static AccountRequestDeletion200ResponseStateEnumTypeTransformer? _instance;
}

enum AccountRequestDeletion200ResponseRestrictedSessionEnum {
  true_._('true'),
  ;

  /// Instantiate a new enum with the provided value.
  const AccountRequestDeletion200ResponseRestrictedSessionEnum._(this._value);

  /// The underlying value of this enum member.
  final bool _value;

  @override
  String toString() => _value.toString();

  /// Encodes this enum as a value suitable for JSON.
  bool toJson() => _value;

  /// Returns the instance of [AccountRequestDeletion200ResponseRestrictedSessionEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static AccountRequestDeletion200ResponseRestrictedSessionEnum? fromJson(
          dynamic value) =>
      AccountRequestDeletion200ResponseRestrictedSessionEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [AccountRequestDeletion200ResponseRestrictedSessionEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<AccountRequestDeletion200ResponseRestrictedSessionEnum>
      listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountRequestDeletion200ResponseRestrictedSessionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            AccountRequestDeletion200ResponseRestrictedSessionEnum.fromJson(
                row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AccountRequestDeletion200ResponseRestrictedSessionEnum] to bool,
/// and [decode] dynamic data back to [AccountRequestDeletion200ResponseRestrictedSessionEnum].
class AccountRequestDeletion200ResponseRestrictedSessionEnumTypeTransformer {
  factory AccountRequestDeletion200ResponseRestrictedSessionEnumTypeTransformer() =>
      _instance ??=
          const AccountRequestDeletion200ResponseRestrictedSessionEnumTypeTransformer
              ._();

  const AccountRequestDeletion200ResponseRestrictedSessionEnumTypeTransformer._();

  bool encode(AccountRequestDeletion200ResponseRestrictedSessionEnum data) =>
      data._value;

  /// Returns the instance of [AccountRequestDeletion200ResponseRestrictedSessionEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AccountRequestDeletion200ResponseRestrictedSessionEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is AccountRequestDeletion200ResponseRestrictedSessionEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case 'true':
          return AccountRequestDeletion200ResponseRestrictedSessionEnum.true_;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static AccountRequestDeletion200ResponseRestrictedSessionEnumTypeTransformer?
      _instance;
}

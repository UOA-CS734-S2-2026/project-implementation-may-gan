//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountDeletionStatus200Response {
  /// Returns a new [AccountDeletionStatus200Response] instance.
  AccountDeletionStatus200Response({
    required this.state,
    required this.generation,
    this.requestId,
    this.requestedAt,
    this.cancelUntil,
    this.purgeDueAt,
  });

  final AccountDeletionStatus200ResponseStateEnum state;

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

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountDeletionStatus200Response &&
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
      'AccountDeletionStatus200Response[state=$state, generation=$generation, requestId=$requestId, requestedAt=$requestedAt, cancelUntil=$cancelUntil, purgeDueAt=$purgeDueAt]';

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

  /// Clones this instance of [AccountDeletionStatus200Response] and returns a new one where some of the
  /// properties have changed.
  AccountDeletionStatus200Response copyWith({
    AccountDeletionStatus200ResponseStateEnum? state,
    int? generation,
    String? requestId,
    DateTime? requestedAt,
    DateTime? cancelUntil,
    DateTime? purgeDueAt,
  }) =>
      AccountDeletionStatus200Response(
        state: state ?? this.state,
        generation: generation ?? this.generation,
        requestId: requestId ?? this.requestId,
        requestedAt: requestedAt ?? this.requestedAt,
        cancelUntil: cancelUntil ?? this.cancelUntil,
        purgeDueAt: purgeDueAt ?? this.purgeDueAt,
      );

  /// Returns a new [AccountDeletionStatus200Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountDeletionStatus200Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'state'),
            'Required key "AccountDeletionStatus200Response[state]" is missing from JSON.');
        assert(json[r'state'] != null,
            'Required key "AccountDeletionStatus200Response[state]" has a null value in JSON.');
        assert(json.containsKey(r'generation'),
            'Required key "AccountDeletionStatus200Response[generation]" is missing from JSON.');
        assert(json[r'generation'] != null,
            'Required key "AccountDeletionStatus200Response[generation]" has a null value in JSON.');
        return true;
      }());

      return AccountDeletionStatus200Response(
        state:
            AccountDeletionStatus200ResponseStateEnum.fromJson(json[r'state'])!,
        generation: mapValueOfType<int>(json, r'generation')!,
        requestId: mapValueOfType<String>(json, r'requestId'),
        requestedAt: mapDateTime(json, r'requestedAt', r''),
        cancelUntil: mapDateTime(json, r'cancelUntil', r''),
        purgeDueAt: mapDateTime(json, r'purgeDueAt', r''),
      );
    }
    return null;
  }

  static List<AccountDeletionStatus200Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountDeletionStatus200Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountDeletionStatus200Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountDeletionStatus200Response> mapFromJson(
      dynamic json) {
    final map = <String, AccountDeletionStatus200Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountDeletionStatus200Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountDeletionStatus200Response-objects as value to a dart map
  static Map<String, List<AccountDeletionStatus200Response>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountDeletionStatus200Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountDeletionStatus200Response.listFromJson(
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
  };
}

enum AccountDeletionStatus200ResponseStateEnum {
  active._(r'active'),
  pendingDeletion._(r'pending_deletion'),
  purging._(r'purging'),
  purgeFailed._(r'purge_failed'),
  ;

  /// Instantiate a new enum with the provided value.
  const AccountDeletionStatus200ResponseStateEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [AccountDeletionStatus200ResponseStateEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static AccountDeletionStatus200ResponseStateEnum? fromJson(dynamic value) =>
      AccountDeletionStatus200ResponseStateEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [AccountDeletionStatus200ResponseStateEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<AccountDeletionStatus200ResponseStateEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountDeletionStatus200ResponseStateEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountDeletionStatus200ResponseStateEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AccountDeletionStatus200ResponseStateEnum] to String,
/// and [decode] dynamic data back to [AccountDeletionStatus200ResponseStateEnum].
class AccountDeletionStatus200ResponseStateEnumTypeTransformer {
  factory AccountDeletionStatus200ResponseStateEnumTypeTransformer() =>
      _instance ??=
          const AccountDeletionStatus200ResponseStateEnumTypeTransformer._();

  const AccountDeletionStatus200ResponseStateEnumTypeTransformer._();

  String encode(AccountDeletionStatus200ResponseStateEnum data) => data._value;

  /// Returns the instance of [AccountDeletionStatus200ResponseStateEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AccountDeletionStatus200ResponseStateEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is AccountDeletionStatus200ResponseStateEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'active':
          return AccountDeletionStatus200ResponseStateEnum.active;
        case r'pending_deletion':
          return AccountDeletionStatus200ResponseStateEnum.pendingDeletion;
        case r'purging':
          return AccountDeletionStatus200ResponseStateEnum.purging;
        case r'purge_failed':
          return AccountDeletionStatus200ResponseStateEnum.purgeFailed;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static AccountDeletionStatus200ResponseStateEnumTypeTransformer? _instance;
}

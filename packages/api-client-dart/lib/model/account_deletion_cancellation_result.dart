//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountDeletionCancellationResult {
  /// Returns a new [AccountDeletionCancellationResult] instance.
  AccountDeletionCancellationResult({
    required this.status,
    required this.generation,
  });

  final AccountDeletionCancellationResultStatusEnum status;

  /// Minimum value: 0
  final int generation;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountDeletionCancellationResult &&
          other.status == status &&
          other.generation == generation;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (status.hashCode) + (generation.hashCode);

  @override
  String toString() =>
      'AccountDeletionCancellationResult[status=$status, generation=$generation]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'status'] = this.status;
    json[r'generation'] = this.generation;
    return json;
  }

  /// Clones this instance of [AccountDeletionCancellationResult] and returns a new one where some of the
  /// properties have changed.
  AccountDeletionCancellationResult copyWith({
    AccountDeletionCancellationResultStatusEnum? status,
    int? generation,
  }) =>
      AccountDeletionCancellationResult(
        status: status ?? this.status,
        generation: generation ?? this.generation,
      );

  /// Returns a new [AccountDeletionCancellationResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountDeletionCancellationResult? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'status'),
            'Required key "AccountDeletionCancellationResult[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "AccountDeletionCancellationResult[status]" has a null value in JSON.');
        assert(json.containsKey(r'generation'),
            'Required key "AccountDeletionCancellationResult[generation]" is missing from JSON.');
        assert(json[r'generation'] != null,
            'Required key "AccountDeletionCancellationResult[generation]" has a null value in JSON.');
        return true;
      }());

      return AccountDeletionCancellationResult(
        status: AccountDeletionCancellationResultStatusEnum.fromJson(
            json[r'status'])!,
        generation: mapValueOfType<int>(json, r'generation')!,
      );
    }
    return null;
  }

  static List<AccountDeletionCancellationResult> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountDeletionCancellationResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountDeletionCancellationResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountDeletionCancellationResult> mapFromJson(
      dynamic json) {
    final map = <String, AccountDeletionCancellationResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountDeletionCancellationResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountDeletionCancellationResult-objects as value to a dart map
  static Map<String, List<AccountDeletionCancellationResult>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountDeletionCancellationResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountDeletionCancellationResult.listFromJson(
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
    'generation',
  };
}

enum AccountDeletionCancellationResultStatusEnum {
  cancelled._(r'cancelled'),
  ;

  /// Instantiate a new enum with the provided value.
  const AccountDeletionCancellationResultStatusEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [AccountDeletionCancellationResultStatusEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static AccountDeletionCancellationResultStatusEnum? fromJson(dynamic value) =>
      AccountDeletionCancellationResultStatusEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [AccountDeletionCancellationResultStatusEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<AccountDeletionCancellationResultStatusEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountDeletionCancellationResultStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountDeletionCancellationResultStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AccountDeletionCancellationResultStatusEnum] to String,
/// and [decode] dynamic data back to [AccountDeletionCancellationResultStatusEnum].
class AccountDeletionCancellationResultStatusEnumTypeTransformer {
  factory AccountDeletionCancellationResultStatusEnumTypeTransformer() =>
      _instance ??=
          const AccountDeletionCancellationResultStatusEnumTypeTransformer._();

  const AccountDeletionCancellationResultStatusEnumTypeTransformer._();

  String encode(AccountDeletionCancellationResultStatusEnum data) =>
      data._value;

  /// Returns the instance of [AccountDeletionCancellationResultStatusEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AccountDeletionCancellationResultStatusEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is AccountDeletionCancellationResultStatusEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'cancelled':
          return AccountDeletionCancellationResultStatusEnum.cancelled;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static AccountDeletionCancellationResultStatusEnumTypeTransformer? _instance;
}

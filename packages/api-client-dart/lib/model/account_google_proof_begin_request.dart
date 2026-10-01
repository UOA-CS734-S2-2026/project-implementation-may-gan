//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountGoogleProofBeginRequest {
  /// Returns a new [AccountGoogleProofBeginRequest] instance.
  AccountGoogleProofBeginRequest({
    required this.action,
  });

  final AccountGoogleProofBeginRequestActionEnum action;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountGoogleProofBeginRequest && other.action == action;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (action.hashCode);

  @override
  String toString() => 'AccountGoogleProofBeginRequest[action=$action]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'action'] = this.action;
    return json;
  }

  /// Clones this instance of [AccountGoogleProofBeginRequest] and returns a new one where some of the
  /// properties have changed.
  AccountGoogleProofBeginRequest copyWith({
    AccountGoogleProofBeginRequestActionEnum? action,
  }) =>
      AccountGoogleProofBeginRequest(
        action: action ?? this.action,
      );

  /// Returns a new [AccountGoogleProofBeginRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountGoogleProofBeginRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'action'),
            'Required key "AccountGoogleProofBeginRequest[action]" is missing from JSON.');
        assert(json[r'action'] != null,
            'Required key "AccountGoogleProofBeginRequest[action]" has a null value in JSON.');
        return true;
      }());

      return AccountGoogleProofBeginRequest(
        action:
            AccountGoogleProofBeginRequestActionEnum.fromJson(json[r'action'])!,
      );
    }
    return null;
  }

  static List<AccountGoogleProofBeginRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountGoogleProofBeginRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountGoogleProofBeginRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountGoogleProofBeginRequest> mapFromJson(dynamic json) {
    final map = <String, AccountGoogleProofBeginRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountGoogleProofBeginRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountGoogleProofBeginRequest-objects as value to a dart map
  static Map<String, List<AccountGoogleProofBeginRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountGoogleProofBeginRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountGoogleProofBeginRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'action',
  };
}

enum AccountGoogleProofBeginRequestActionEnum {
  requestDeletion._(r'request_deletion'),
  cancelDeletion._(r'cancel_deletion'),
  ;

  /// Instantiate a new enum with the provided value.
  const AccountGoogleProofBeginRequestActionEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [AccountGoogleProofBeginRequestActionEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static AccountGoogleProofBeginRequestActionEnum? fromJson(dynamic value) =>
      AccountGoogleProofBeginRequestActionEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [AccountGoogleProofBeginRequestActionEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<AccountGoogleProofBeginRequestActionEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountGoogleProofBeginRequestActionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountGoogleProofBeginRequestActionEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AccountGoogleProofBeginRequestActionEnum] to String,
/// and [decode] dynamic data back to [AccountGoogleProofBeginRequestActionEnum].
class AccountGoogleProofBeginRequestActionEnumTypeTransformer {
  factory AccountGoogleProofBeginRequestActionEnumTypeTransformer() =>
      _instance ??=
          const AccountGoogleProofBeginRequestActionEnumTypeTransformer._();

  const AccountGoogleProofBeginRequestActionEnumTypeTransformer._();

  String encode(AccountGoogleProofBeginRequestActionEnum data) => data._value;

  /// Returns the instance of [AccountGoogleProofBeginRequestActionEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AccountGoogleProofBeginRequestActionEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is AccountGoogleProofBeginRequestActionEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'request_deletion':
          return AccountGoogleProofBeginRequestActionEnum.requestDeletion;
        case r'cancel_deletion':
          return AccountGoogleProofBeginRequestActionEnum.cancelDeletion;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static AccountGoogleProofBeginRequestActionEnumTypeTransformer? _instance;
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountGoogleProofCompleteRequest {
  /// Returns a new [AccountGoogleProofCompleteRequest] instance.
  AccountGoogleProofCompleteRequest({
    required this.action,
    required this.state,
  });

  final AccountGoogleProofCompleteRequestActionEnum action;

  final String state;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountGoogleProofCompleteRequest &&
          other.action == action &&
          other.state == state;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (action.hashCode) + (state.hashCode);

  @override
  String toString() =>
      'AccountGoogleProofCompleteRequest[action=$action, state=$state]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'action'] = this.action;
    json[r'state'] = this.state;
    return json;
  }

  /// Clones this instance of [AccountGoogleProofCompleteRequest] and returns a new one where some of the
  /// properties have changed.
  AccountGoogleProofCompleteRequest copyWith({
    AccountGoogleProofCompleteRequestActionEnum? action,
    String? state,
  }) =>
      AccountGoogleProofCompleteRequest(
        action: action ?? this.action,
        state: state ?? this.state,
      );

  /// Returns a new [AccountGoogleProofCompleteRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountGoogleProofCompleteRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'action'),
            'Required key "AccountGoogleProofCompleteRequest[action]" is missing from JSON.');
        assert(json[r'action'] != null,
            'Required key "AccountGoogleProofCompleteRequest[action]" has a null value in JSON.');
        assert(json.containsKey(r'state'),
            'Required key "AccountGoogleProofCompleteRequest[state]" is missing from JSON.');
        assert(json[r'state'] != null,
            'Required key "AccountGoogleProofCompleteRequest[state]" has a null value in JSON.');
        return true;
      }());

      return AccountGoogleProofCompleteRequest(
        action: AccountGoogleProofCompleteRequestActionEnum.fromJson(
            json[r'action'])!,
        state: mapValueOfType<String>(json, r'state')!,
      );
    }
    return null;
  }

  static List<AccountGoogleProofCompleteRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountGoogleProofCompleteRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountGoogleProofCompleteRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountGoogleProofCompleteRequest> mapFromJson(
      dynamic json) {
    final map = <String, AccountGoogleProofCompleteRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountGoogleProofCompleteRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountGoogleProofCompleteRequest-objects as value to a dart map
  static Map<String, List<AccountGoogleProofCompleteRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountGoogleProofCompleteRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountGoogleProofCompleteRequest.listFromJson(
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
    'state',
  };
}

enum AccountGoogleProofCompleteRequestActionEnum {
  requestDeletion._(r'request_deletion'),
  cancelDeletion._(r'cancel_deletion'),
  ;

  /// Instantiate a new enum with the provided value.
  const AccountGoogleProofCompleteRequestActionEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [AccountGoogleProofCompleteRequestActionEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static AccountGoogleProofCompleteRequestActionEnum? fromJson(dynamic value) =>
      AccountGoogleProofCompleteRequestActionEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [AccountGoogleProofCompleteRequestActionEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<AccountGoogleProofCompleteRequestActionEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountGoogleProofCompleteRequestActionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountGoogleProofCompleteRequestActionEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AccountGoogleProofCompleteRequestActionEnum] to String,
/// and [decode] dynamic data back to [AccountGoogleProofCompleteRequestActionEnum].
class AccountGoogleProofCompleteRequestActionEnumTypeTransformer {
  factory AccountGoogleProofCompleteRequestActionEnumTypeTransformer() =>
      _instance ??=
          const AccountGoogleProofCompleteRequestActionEnumTypeTransformer._();

  const AccountGoogleProofCompleteRequestActionEnumTypeTransformer._();

  String encode(AccountGoogleProofCompleteRequestActionEnum data) =>
      data._value;

  /// Returns the instance of [AccountGoogleProofCompleteRequestActionEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AccountGoogleProofCompleteRequestActionEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is AccountGoogleProofCompleteRequestActionEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'request_deletion':
          return AccountGoogleProofCompleteRequestActionEnum.requestDeletion;
        case r'cancel_deletion':
          return AccountGoogleProofCompleteRequestActionEnum.cancelDeletion;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static AccountGoogleProofCompleteRequestActionEnumTypeTransformer? _instance;
}

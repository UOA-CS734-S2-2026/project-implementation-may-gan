//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PasswordReauthenticationRequest {
  /// Returns a new [PasswordReauthenticationRequest] instance.
  PasswordReauthenticationRequest({
    required this.action,
    required this.password,
  });

  final PasswordReauthenticationRequestActionEnum action;

  final String password;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PasswordReauthenticationRequest &&
          other.action == action &&
          other.password == password;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (action.hashCode) + (password.hashCode);

  @override
  String toString() =>
      'PasswordReauthenticationRequest[action=$action, password=$password]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'action'] = this.action;
    json[r'password'] = this.password;
    return json;
  }

  /// Clones this instance of [PasswordReauthenticationRequest] and returns a new one where some of the
  /// properties have changed.
  PasswordReauthenticationRequest copyWith({
    PasswordReauthenticationRequestActionEnum? action,
    String? password,
  }) =>
      PasswordReauthenticationRequest(
        action: action ?? this.action,
        password: password ?? this.password,
      );

  /// Returns a new [PasswordReauthenticationRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PasswordReauthenticationRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'action'),
            'Required key "PasswordReauthenticationRequest[action]" is missing from JSON.');
        assert(json[r'action'] != null,
            'Required key "PasswordReauthenticationRequest[action]" has a null value in JSON.');
        assert(json.containsKey(r'password'),
            'Required key "PasswordReauthenticationRequest[password]" is missing from JSON.');
        assert(json[r'password'] != null,
            'Required key "PasswordReauthenticationRequest[password]" has a null value in JSON.');
        return true;
      }());

      return PasswordReauthenticationRequest(
        action: PasswordReauthenticationRequestActionEnum.fromJson(
            json[r'action'])!,
        password: mapValueOfType<String>(json, r'password')!,
      );
    }
    return null;
  }

  static List<PasswordReauthenticationRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PasswordReauthenticationRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PasswordReauthenticationRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PasswordReauthenticationRequest> mapFromJson(
      dynamic json) {
    final map = <String, PasswordReauthenticationRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PasswordReauthenticationRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PasswordReauthenticationRequest-objects as value to a dart map
  static Map<String, List<PasswordReauthenticationRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PasswordReauthenticationRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PasswordReauthenticationRequest.listFromJson(
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
    'password',
  };
}

enum PasswordReauthenticationRequestActionEnum {
  requestDeletion._(r'request_deletion'),
  cancelDeletion._(r'cancel_deletion'),
  ;

  /// Instantiate a new enum with the provided value.
  const PasswordReauthenticationRequestActionEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [PasswordReauthenticationRequestActionEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static PasswordReauthenticationRequestActionEnum? fromJson(dynamic value) =>
      PasswordReauthenticationRequestActionEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [PasswordReauthenticationRequestActionEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<PasswordReauthenticationRequestActionEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PasswordReauthenticationRequestActionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PasswordReauthenticationRequestActionEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [PasswordReauthenticationRequestActionEnum] to String,
/// and [decode] dynamic data back to [PasswordReauthenticationRequestActionEnum].
class PasswordReauthenticationRequestActionEnumTypeTransformer {
  factory PasswordReauthenticationRequestActionEnumTypeTransformer() =>
      _instance ??=
          const PasswordReauthenticationRequestActionEnumTypeTransformer._();

  const PasswordReauthenticationRequestActionEnumTypeTransformer._();

  String encode(PasswordReauthenticationRequestActionEnum data) => data._value;

  /// Returns the instance of [PasswordReauthenticationRequestActionEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  PasswordReauthenticationRequestActionEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is PasswordReauthenticationRequestActionEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'request_deletion':
          return PasswordReauthenticationRequestActionEnum.requestDeletion;
        case r'cancel_deletion':
          return PasswordReauthenticationRequestActionEnum.cancelDeletion;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static PasswordReauthenticationRequestActionEnumTypeTransformer? _instance;
}

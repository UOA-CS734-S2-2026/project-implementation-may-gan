//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PasswordReauthenticationGrant {
  /// Returns a new [PasswordReauthenticationGrant] instance.
  PasswordReauthenticationGrant({
    required this.token,
    required this.expiresAt,
    required this.action,
  });

  final String token;

  final DateTime expiresAt;

  final PasswordReauthenticationGrantActionEnum action;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PasswordReauthenticationGrant &&
          other.token == token &&
          other.expiresAt == expiresAt &&
          other.action == action;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (token.hashCode) + (expiresAt.hashCode) + (action.hashCode);

  @override
  String toString() =>
      'PasswordReauthenticationGrant[token=$token, expiresAt=$expiresAt, action=$action]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'token'] = this.token;
    json[r'expiresAt'] = this.expiresAt.toUtc().toIso8601String();
    json[r'action'] = this.action;
    return json;
  }

  /// Clones this instance of [PasswordReauthenticationGrant] and returns a new one where some of the
  /// properties have changed.
  PasswordReauthenticationGrant copyWith({
    String? token,
    DateTime? expiresAt,
    PasswordReauthenticationGrantActionEnum? action,
  }) =>
      PasswordReauthenticationGrant(
        token: token ?? this.token,
        expiresAt: expiresAt ?? this.expiresAt,
        action: action ?? this.action,
      );

  /// Returns a new [PasswordReauthenticationGrant] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PasswordReauthenticationGrant? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'token'),
            'Required key "PasswordReauthenticationGrant[token]" is missing from JSON.');
        assert(json[r'token'] != null,
            'Required key "PasswordReauthenticationGrant[token]" has a null value in JSON.');
        assert(json.containsKey(r'expiresAt'),
            'Required key "PasswordReauthenticationGrant[expiresAt]" is missing from JSON.');
        assert(json[r'expiresAt'] != null,
            'Required key "PasswordReauthenticationGrant[expiresAt]" has a null value in JSON.');
        assert(json.containsKey(r'action'),
            'Required key "PasswordReauthenticationGrant[action]" is missing from JSON.');
        assert(json[r'action'] != null,
            'Required key "PasswordReauthenticationGrant[action]" has a null value in JSON.');
        return true;
      }());

      return PasswordReauthenticationGrant(
        token: mapValueOfType<String>(json, r'token')!,
        expiresAt: mapDateTime(json, r'expiresAt', r'')!,
        action:
            PasswordReauthenticationGrantActionEnum.fromJson(json[r'action'])!,
      );
    }
    return null;
  }

  static List<PasswordReauthenticationGrant> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PasswordReauthenticationGrant>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PasswordReauthenticationGrant.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PasswordReauthenticationGrant> mapFromJson(dynamic json) {
    final map = <String, PasswordReauthenticationGrant>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PasswordReauthenticationGrant.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PasswordReauthenticationGrant-objects as value to a dart map
  static Map<String, List<PasswordReauthenticationGrant>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PasswordReauthenticationGrant>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PasswordReauthenticationGrant.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'token',
    'expiresAt',
    'action',
  };
}

enum PasswordReauthenticationGrantActionEnum {
  requestDeletion._(r'request_deletion'),
  cancelDeletion._(r'cancel_deletion'),
  ;

  /// Instantiate a new enum with the provided value.
  const PasswordReauthenticationGrantActionEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [PasswordReauthenticationGrantActionEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static PasswordReauthenticationGrantActionEnum? fromJson(dynamic value) =>
      PasswordReauthenticationGrantActionEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [PasswordReauthenticationGrantActionEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<PasswordReauthenticationGrantActionEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PasswordReauthenticationGrantActionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PasswordReauthenticationGrantActionEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [PasswordReauthenticationGrantActionEnum] to String,
/// and [decode] dynamic data back to [PasswordReauthenticationGrantActionEnum].
class PasswordReauthenticationGrantActionEnumTypeTransformer {
  factory PasswordReauthenticationGrantActionEnumTypeTransformer() =>
      _instance ??=
          const PasswordReauthenticationGrantActionEnumTypeTransformer._();

  const PasswordReauthenticationGrantActionEnumTypeTransformer._();

  String encode(PasswordReauthenticationGrantActionEnum data) => data._value;

  /// Returns the instance of [PasswordReauthenticationGrantActionEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  PasswordReauthenticationGrantActionEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is PasswordReauthenticationGrantActionEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'request_deletion':
          return PasswordReauthenticationGrantActionEnum.requestDeletion;
        case r'cancel_deletion':
          return PasswordReauthenticationGrantActionEnum.cancelDeletion;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static PasswordReauthenticationGrantActionEnumTypeTransformer? _instance;
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RegisterPushDeviceRequest {
  /// Returns a new [RegisterPushDeviceRequest] instance.
  RegisterPushDeviceRequest({
    required this.token,
    required this.platform,
    required this.optedIn,
    this.notificationSchemaVersion,
  });

  final String token;

  final RegisterPushDeviceRequestPlatformEnum platform;

  final bool optedIn;

  /// Minimum value: 1
  /// Maximum value: 1
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final int? notificationSchemaVersion;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RegisterPushDeviceRequest &&
          other.token == token &&
          other.platform == platform &&
          other.optedIn == optedIn &&
          other.notificationSchemaVersion == notificationSchemaVersion;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (token.hashCode) +
      (platform.hashCode) +
      (optedIn.hashCode) +
      (notificationSchemaVersion == null
          ? 0
          : notificationSchemaVersion!.hashCode);

  @override
  String toString() =>
      'RegisterPushDeviceRequest[token=$token, platform=$platform, optedIn=$optedIn, notificationSchemaVersion=$notificationSchemaVersion]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'token'] = this.token;
    json[r'platform'] = this.platform;
    json[r'optedIn'] = this.optedIn;
    if (this.notificationSchemaVersion != null) {
      json[r'notificationSchemaVersion'] = this.notificationSchemaVersion;
    }
    return json;
  }

  /// Clones this instance of [RegisterPushDeviceRequest] and returns a new one where some of the
  /// properties have changed.
  RegisterPushDeviceRequest copyWith({
    String? token,
    RegisterPushDeviceRequestPlatformEnum? platform,
    bool? optedIn,
    int? notificationSchemaVersion,
  }) =>
      RegisterPushDeviceRequest(
        token: token ?? this.token,
        platform: platform ?? this.platform,
        optedIn: optedIn ?? this.optedIn,
        notificationSchemaVersion:
            notificationSchemaVersion ?? this.notificationSchemaVersion,
      );

  /// Returns a new [RegisterPushDeviceRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RegisterPushDeviceRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'token'),
            'Required key "RegisterPushDeviceRequest[token]" is missing from JSON.');
        assert(json[r'token'] != null,
            'Required key "RegisterPushDeviceRequest[token]" has a null value in JSON.');
        assert(json.containsKey(r'platform'),
            'Required key "RegisterPushDeviceRequest[platform]" is missing from JSON.');
        assert(json[r'platform'] != null,
            'Required key "RegisterPushDeviceRequest[platform]" has a null value in JSON.');
        assert(json.containsKey(r'optedIn'),
            'Required key "RegisterPushDeviceRequest[optedIn]" is missing from JSON.');
        assert(json[r'optedIn'] != null,
            'Required key "RegisterPushDeviceRequest[optedIn]" has a null value in JSON.');
        return true;
      }());

      return RegisterPushDeviceRequest(
        token: mapValueOfType<String>(json, r'token')!,
        platform:
            RegisterPushDeviceRequestPlatformEnum.fromJson(json[r'platform'])!,
        optedIn: mapValueOfType<bool>(json, r'optedIn')!,
        notificationSchemaVersion:
            mapValueOfType<int>(json, r'notificationSchemaVersion'),
      );
    }
    return null;
  }

  static List<RegisterPushDeviceRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <RegisterPushDeviceRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RegisterPushDeviceRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RegisterPushDeviceRequest> mapFromJson(dynamic json) {
    final map = <String, RegisterPushDeviceRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RegisterPushDeviceRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RegisterPushDeviceRequest-objects as value to a dart map
  static Map<String, List<RegisterPushDeviceRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<RegisterPushDeviceRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RegisterPushDeviceRequest.listFromJson(
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
    'platform',
    'optedIn',
  };
}

enum RegisterPushDeviceRequestPlatformEnum {
  ios._(r'ios'),
  android._(r'android'),
  ;

  /// Instantiate a new enum with the provided value.
  const RegisterPushDeviceRequestPlatformEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [RegisterPushDeviceRequestPlatformEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static RegisterPushDeviceRequestPlatformEnum? fromJson(dynamic value) =>
      RegisterPushDeviceRequestPlatformEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [RegisterPushDeviceRequestPlatformEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<RegisterPushDeviceRequestPlatformEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <RegisterPushDeviceRequestPlatformEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RegisterPushDeviceRequestPlatformEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [RegisterPushDeviceRequestPlatformEnum] to String,
/// and [decode] dynamic data back to [RegisterPushDeviceRequestPlatformEnum].
class RegisterPushDeviceRequestPlatformEnumTypeTransformer {
  factory RegisterPushDeviceRequestPlatformEnumTypeTransformer() =>
      _instance ??=
          const RegisterPushDeviceRequestPlatformEnumTypeTransformer._();

  const RegisterPushDeviceRequestPlatformEnumTypeTransformer._();

  String encode(RegisterPushDeviceRequestPlatformEnum data) => data._value;

  /// Returns the instance of [RegisterPushDeviceRequestPlatformEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  RegisterPushDeviceRequestPlatformEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is RegisterPushDeviceRequestPlatformEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'ios':
          return RegisterPushDeviceRequestPlatformEnum.ios;
        case r'android':
          return RegisterPushDeviceRequestPlatformEnum.android;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static RegisterPushDeviceRequestPlatformEnumTypeTransformer? _instance;
}

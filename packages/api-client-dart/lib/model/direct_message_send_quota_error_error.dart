//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class DirectMessageSendQuotaErrorError {
  /// Returns a new [DirectMessageSendQuotaErrorError] instance.
  DirectMessageSendQuotaErrorError({
    required this.code,
    required this.message,
    required this.requestId,
    required this.details,
  });

  final DirectMessageSendQuotaErrorErrorCodeEnum code;

  final String message;

  final String requestId;

  final DirectMessageSendQuotaErrorErrorDetails details;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DirectMessageSendQuotaErrorError &&
          other.code == code &&
          other.message == message &&
          other.requestId == requestId &&
          other.details == details;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (code.hashCode) +
      (message.hashCode) +
      (requestId.hashCode) +
      (details.hashCode);

  @override
  String toString() =>
      'DirectMessageSendQuotaErrorError[code=$code, message=$message, requestId=$requestId, details=$details]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'code'] = this.code;
    json[r'message'] = this.message;
    json[r'requestId'] = this.requestId;
    json[r'details'] = this.details;
    return json;
  }

  /// Clones this instance of [DirectMessageSendQuotaErrorError] and returns a new one where some of the
  /// properties have changed.
  DirectMessageSendQuotaErrorError copyWith({
    DirectMessageSendQuotaErrorErrorCodeEnum? code,
    String? message,
    String? requestId,
    DirectMessageSendQuotaErrorErrorDetails? details,
  }) =>
      DirectMessageSendQuotaErrorError(
        code: code ?? this.code,
        message: message ?? this.message,
        requestId: requestId ?? this.requestId,
        details: details ?? this.details,
      );

  /// Returns a new [DirectMessageSendQuotaErrorError] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static DirectMessageSendQuotaErrorError? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'code'),
            'Required key "DirectMessageSendQuotaErrorError[code]" is missing from JSON.');
        assert(json[r'code'] != null,
            'Required key "DirectMessageSendQuotaErrorError[code]" has a null value in JSON.');
        assert(json.containsKey(r'message'),
            'Required key "DirectMessageSendQuotaErrorError[message]" is missing from JSON.');
        assert(json[r'message'] != null,
            'Required key "DirectMessageSendQuotaErrorError[message]" has a null value in JSON.');
        assert(json.containsKey(r'requestId'),
            'Required key "DirectMessageSendQuotaErrorError[requestId]" is missing from JSON.');
        assert(json[r'requestId'] != null,
            'Required key "DirectMessageSendQuotaErrorError[requestId]" has a null value in JSON.');
        assert(json.containsKey(r'details'),
            'Required key "DirectMessageSendQuotaErrorError[details]" is missing from JSON.');
        assert(json[r'details'] != null,
            'Required key "DirectMessageSendQuotaErrorError[details]" has a null value in JSON.');
        return true;
      }());

      return DirectMessageSendQuotaErrorError(
        code: DirectMessageSendQuotaErrorErrorCodeEnum.fromJson(json[r'code'])!,
        message: mapValueOfType<String>(json, r'message')!,
        requestId: mapValueOfType<String>(json, r'requestId')!,
        details:
            DirectMessageSendQuotaErrorErrorDetails.fromJson(json[r'details'])!,
      );
    }
    return null;
  }

  static List<DirectMessageSendQuotaErrorError> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <DirectMessageSendQuotaErrorError>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = DirectMessageSendQuotaErrorError.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, DirectMessageSendQuotaErrorError> mapFromJson(
      dynamic json) {
    final map = <String, DirectMessageSendQuotaErrorError>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = DirectMessageSendQuotaErrorError.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of DirectMessageSendQuotaErrorError-objects as value to a dart map
  static Map<String, List<DirectMessageSendQuotaErrorError>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<DirectMessageSendQuotaErrorError>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = DirectMessageSendQuotaErrorError.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'code',
    'message',
    'requestId',
    'details',
  };
}

enum DirectMessageSendQuotaErrorErrorCodeEnum {
  RATE_LIMITED._(r'RATE_LIMITED'),
  ;

  /// Instantiate a new enum with the provided value.
  const DirectMessageSendQuotaErrorErrorCodeEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [DirectMessageSendQuotaErrorErrorCodeEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static DirectMessageSendQuotaErrorErrorCodeEnum? fromJson(dynamic value) =>
      DirectMessageSendQuotaErrorErrorCodeEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [DirectMessageSendQuotaErrorErrorCodeEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<DirectMessageSendQuotaErrorErrorCodeEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <DirectMessageSendQuotaErrorErrorCodeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = DirectMessageSendQuotaErrorErrorCodeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [DirectMessageSendQuotaErrorErrorCodeEnum] to String,
/// and [decode] dynamic data back to [DirectMessageSendQuotaErrorErrorCodeEnum].
class DirectMessageSendQuotaErrorErrorCodeEnumTypeTransformer {
  factory DirectMessageSendQuotaErrorErrorCodeEnumTypeTransformer() =>
      _instance ??=
          const DirectMessageSendQuotaErrorErrorCodeEnumTypeTransformer._();

  const DirectMessageSendQuotaErrorErrorCodeEnumTypeTransformer._();

  String encode(DirectMessageSendQuotaErrorErrorCodeEnum data) => data._value;

  /// Returns the instance of [DirectMessageSendQuotaErrorErrorCodeEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  DirectMessageSendQuotaErrorErrorCodeEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is DirectMessageSendQuotaErrorErrorCodeEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'RATE_LIMITED':
          return DirectMessageSendQuotaErrorErrorCodeEnum.RATE_LIMITED;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static DirectMessageSendQuotaErrorErrorCodeEnumTypeTransformer? _instance;
}

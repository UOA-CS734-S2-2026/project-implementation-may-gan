//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class GoogleReauthenticationRequest {
  /// Returns a new [GoogleReauthenticationRequest] instance.
  GoogleReauthenticationRequest({
    required this.action,
  });

  final GoogleReauthenticationRequestActionEnum action;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GoogleReauthenticationRequest && other.action == action;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (action.hashCode);

  @override
  String toString() => 'GoogleReauthenticationRequest[action=$action]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'action'] = this.action;
    return json;
  }

  /// Clones this instance of [GoogleReauthenticationRequest] and returns a new one where some of the
  /// properties have changed.
  GoogleReauthenticationRequest copyWith({
    GoogleReauthenticationRequestActionEnum? action,
  }) =>
      GoogleReauthenticationRequest(
        action: action ?? this.action,
      );

  /// Returns a new [GoogleReauthenticationRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static GoogleReauthenticationRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'action'),
            'Required key "GoogleReauthenticationRequest[action]" is missing from JSON.');
        assert(json[r'action'] != null,
            'Required key "GoogleReauthenticationRequest[action]" has a null value in JSON.');
        return true;
      }());

      return GoogleReauthenticationRequest(
        action:
            GoogleReauthenticationRequestActionEnum.fromJson(json[r'action'])!,
      );
    }
    return null;
  }

  static List<GoogleReauthenticationRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <GoogleReauthenticationRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = GoogleReauthenticationRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, GoogleReauthenticationRequest> mapFromJson(dynamic json) {
    final map = <String, GoogleReauthenticationRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = GoogleReauthenticationRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of GoogleReauthenticationRequest-objects as value to a dart map
  static Map<String, List<GoogleReauthenticationRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<GoogleReauthenticationRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = GoogleReauthenticationRequest.listFromJson(
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

enum GoogleReauthenticationRequestActionEnum {
  requestDeletion._(r'request_deletion'),
  cancelDeletion._(r'cancel_deletion'),
  ;

  /// Instantiate a new enum with the provided value.
  const GoogleReauthenticationRequestActionEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [GoogleReauthenticationRequestActionEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static GoogleReauthenticationRequestActionEnum? fromJson(dynamic value) =>
      GoogleReauthenticationRequestActionEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [GoogleReauthenticationRequestActionEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<GoogleReauthenticationRequestActionEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <GoogleReauthenticationRequestActionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = GoogleReauthenticationRequestActionEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [GoogleReauthenticationRequestActionEnum] to String,
/// and [decode] dynamic data back to [GoogleReauthenticationRequestActionEnum].
class GoogleReauthenticationRequestActionEnumTypeTransformer {
  factory GoogleReauthenticationRequestActionEnumTypeTransformer() =>
      _instance ??=
          const GoogleReauthenticationRequestActionEnumTypeTransformer._();

  const GoogleReauthenticationRequestActionEnumTypeTransformer._();

  String encode(GoogleReauthenticationRequestActionEnum data) => data._value;

  /// Returns the instance of [GoogleReauthenticationRequestActionEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  GoogleReauthenticationRequestActionEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is GoogleReauthenticationRequestActionEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'request_deletion':
          return GoogleReauthenticationRequestActionEnum.requestDeletion;
        case r'cancel_deletion':
          return GoogleReauthenticationRequestActionEnum.cancelDeletion;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static GoogleReauthenticationRequestActionEnumTypeTransformer? _instance;
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ApiErrorError {
  /// Returns a new [ApiErrorError] instance.
  ApiErrorError({
    required this.code,
    required this.message,
    required this.requestId,
    this.details = const {},
  });

  final ApiErrorCode code;

  final String message;

  final String requestId;

  final Map<String, Object?> details;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ApiErrorError &&
    other.code == code &&
    other.message == message &&
    other.requestId == requestId &&
    _deepEquality.equals(other.details, details);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (code.hashCode) +
    (message.hashCode) +
    (requestId.hashCode) +
    (details.hashCode);

  @override
  String toString() => 'ApiErrorError[code=$code, message=$message, requestId=$requestId, details=$details]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'code'] = this.code;
      json[r'message'] = this.message;
      json[r'requestId'] = this.requestId;
      json[r'details'] = this.details;
    return json;
  }

  /// Clones this instance of [ApiErrorError] and returns a new one where some of the
  /// properties have changed.
  ApiErrorError copyWith({
    ApiErrorCode? code,
    String? message,
    String? requestId,
    Map<String, Object?>? details,
  }) => ApiErrorError(
    code: code ?? this.code,
    message: message ?? this.message,
    requestId: requestId ?? this.requestId,
    details: details ?? this.details,
  );

  /// Returns a new [ApiErrorError] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ApiErrorError? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'code'), 'Required key "ApiErrorError[code]" is missing from JSON.');
        assert(json[r'code'] != null, 'Required key "ApiErrorError[code]" has a null value in JSON.');
        assert(json.containsKey(r'message'), 'Required key "ApiErrorError[message]" is missing from JSON.');
        assert(json[r'message'] != null, 'Required key "ApiErrorError[message]" has a null value in JSON.');
        assert(json.containsKey(r'requestId'), 'Required key "ApiErrorError[requestId]" is missing from JSON.');
        assert(json[r'requestId'] != null, 'Required key "ApiErrorError[requestId]" has a null value in JSON.');
        return true;
      }());

      return ApiErrorError(
        code: ApiErrorCode.fromJson(json[r'code'])!,
        message: mapValueOfType<String>(json, r'message')!,
        requestId: mapValueOfType<String>(json, r'requestId')!,
        details: mapCastOfType<String, Object>(json, r'details') ?? const {},
      );
    }
    return null;
  }

  static List<ApiErrorError> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ApiErrorError>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ApiErrorError.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ApiErrorError> mapFromJson(dynamic json) {
    final map = <String, ApiErrorError>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ApiErrorError.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ApiErrorError-objects as value to a dart map
  static Map<String, List<ApiErrorError>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ApiErrorError>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ApiErrorError.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'code',
    'message',
    'requestId',
  };
}

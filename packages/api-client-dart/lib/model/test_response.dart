//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class TestResponse {
  /// Returns a new [TestResponse] instance.
  TestResponse({
    required this.message,
    required this.timestamp,
    required this.aucklandDate,
    required this.requestedLimit,
  });

  final TestResponseMessageEnum message;

  final DateTime timestamp;

  final String aucklandDate;

  final int requestedLimit;

  @override
  bool operator ==(Object other) => identical(this, other) || other is TestResponse &&
    other.message == message &&
    other.timestamp == timestamp &&
    other.aucklandDate == aucklandDate &&
    other.requestedLimit == requestedLimit;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (message.hashCode) +
    (timestamp.hashCode) +
    (aucklandDate.hashCode) +
    (requestedLimit.hashCode);

  @override
  String toString() => 'TestResponse[message=$message, timestamp=$timestamp, aucklandDate=$aucklandDate, requestedLimit=$requestedLimit]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'message'] = this.message;
      json[r'timestamp'] = this.timestamp.toUtc().toIso8601String();
      json[r'aucklandDate'] = this.aucklandDate;
      json[r'requestedLimit'] = this.requestedLimit;
    return json;
  }

  /// Clones this instance of [TestResponse] and returns a new one where some of the
  /// properties have changed.
  TestResponse copyWith({
    TestResponseMessageEnum? message,
    DateTime? timestamp,
    String? aucklandDate,
    int? requestedLimit,
  }) => TestResponse(
    message: message ?? this.message,
    timestamp: timestamp ?? this.timestamp,
    aucklandDate: aucklandDate ?? this.aucklandDate,
    requestedLimit: requestedLimit ?? this.requestedLimit,
  );

  /// Returns a new [TestResponse] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static TestResponse? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'message'), 'Required key "TestResponse[message]" is missing from JSON.');
        assert(json[r'message'] != null, 'Required key "TestResponse[message]" has a null value in JSON.');
        assert(json.containsKey(r'timestamp'), 'Required key "TestResponse[timestamp]" is missing from JSON.');
        assert(json[r'timestamp'] != null, 'Required key "TestResponse[timestamp]" has a null value in JSON.');
        assert(json.containsKey(r'aucklandDate'), 'Required key "TestResponse[aucklandDate]" is missing from JSON.');
        assert(json[r'aucklandDate'] != null, 'Required key "TestResponse[aucklandDate]" has a null value in JSON.');
        assert(json.containsKey(r'requestedLimit'), 'Required key "TestResponse[requestedLimit]" is missing from JSON.');
        assert(json[r'requestedLimit'] != null, 'Required key "TestResponse[requestedLimit]" has a null value in JSON.');
        return true;
      }());

      return TestResponse(
        message: TestResponseMessageEnum.fromJson(json[r'message'])!,
        timestamp: mapDateTime(json, r'timestamp', r'')!,
        aucklandDate: mapValueOfType<String>(json, r'aucklandDate')!,
        requestedLimit: mapValueOfType<int>(json, r'requestedLimit')!,
      );
    }
    return null;
  }

  static List<TestResponse> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <TestResponse>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = TestResponse.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, TestResponse> mapFromJson(dynamic json) {
    final map = <String, TestResponse>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = TestResponse.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of TestResponse-objects as value to a dart map
  static Map<String, List<TestResponse>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<TestResponse>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = TestResponse.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'message',
    'timestamp',
    'aucklandDate',
    'requestedLimit',
  };
}


enum TestResponseMessageEnum {
  dayliAPIContractsAreAvailablePeriod._(r'Dayli API contracts are available.'),
  ;

  /// Instantiate a new enum with the provided value.
  const TestResponseMessageEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [TestResponseMessageEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static TestResponseMessageEnum? fromJson(dynamic value) => TestResponseMessageEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [TestResponseMessageEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<TestResponseMessageEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <TestResponseMessageEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = TestResponseMessageEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [TestResponseMessageEnum] to String,
/// and [decode] dynamic data back to [TestResponseMessageEnum].
class TestResponseMessageEnumTypeTransformer {
  factory TestResponseMessageEnumTypeTransformer() => _instance ??= const TestResponseMessageEnumTypeTransformer._();

  const TestResponseMessageEnumTypeTransformer._();

  String encode(TestResponseMessageEnum data) => data._value;

  /// Returns the instance of [TestResponseMessageEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  TestResponseMessageEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is TestResponseMessageEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'Dayli API contracts are available.': return TestResponseMessageEnum.dayliAPIContractsAreAvailablePeriod;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static TestResponseMessageEnumTypeTransformer? _instance;
}

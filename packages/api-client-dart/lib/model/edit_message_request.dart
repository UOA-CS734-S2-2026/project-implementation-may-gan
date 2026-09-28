//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class EditMessageRequest {
  /// Returns a new [EditMessageRequest] instance.
  EditMessageRequest({
    required this.text,
    required this.expectedVersion,
  });

  /// 1 through 4,000 Unicode code points. The 8,000 code-unit cap preserves valid astral Unicode text.
  final String text;

  /// Minimum value: 1
  final int expectedVersion;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is EditMessageRequest &&
          other.text == text &&
          other.expectedVersion == expectedVersion;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (text.hashCode) + (expectedVersion.hashCode);

  @override
  String toString() =>
      'EditMessageRequest[text=$text, expectedVersion=$expectedVersion]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'text'] = this.text;
    json[r'expectedVersion'] = this.expectedVersion;
    return json;
  }

  /// Clones this instance of [EditMessageRequest] and returns a new one where some of the
  /// properties have changed.
  EditMessageRequest copyWith({
    String? text,
    int? expectedVersion,
  }) =>
      EditMessageRequest(
        text: text ?? this.text,
        expectedVersion: expectedVersion ?? this.expectedVersion,
      );

  /// Returns a new [EditMessageRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static EditMessageRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'text'),
            'Required key "EditMessageRequest[text]" is missing from JSON.');
        assert(json[r'text'] != null,
            'Required key "EditMessageRequest[text]" has a null value in JSON.');
        assert(json.containsKey(r'expectedVersion'),
            'Required key "EditMessageRequest[expectedVersion]" is missing from JSON.');
        assert(json[r'expectedVersion'] != null,
            'Required key "EditMessageRequest[expectedVersion]" has a null value in JSON.');
        return true;
      }());

      return EditMessageRequest(
        text: mapValueOfType<String>(json, r'text')!,
        expectedVersion: mapValueOfType<int>(json, r'expectedVersion')!,
      );
    }
    return null;
  }

  static List<EditMessageRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <EditMessageRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = EditMessageRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, EditMessageRequest> mapFromJson(dynamic json) {
    final map = <String, EditMessageRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = EditMessageRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of EditMessageRequest-objects as value to a dart map
  static Map<String, List<EditMessageRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<EditMessageRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = EditMessageRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'text',
    'expectedVersion',
  };
}

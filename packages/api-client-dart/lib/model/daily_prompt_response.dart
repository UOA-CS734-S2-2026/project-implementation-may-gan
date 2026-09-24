//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class DailyPromptResponse {
  /// Returns a new [DailyPromptResponse] instance.
  DailyPromptResponse({
    required this.id,
    required this.text,
  });

  final String id;

  final String text;

  @override
  bool operator ==(Object other) => identical(this, other) || other is DailyPromptResponse &&
    other.id == id &&
    other.text == text;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (text.hashCode);

  @override
  String toString() => 'DailyPromptResponse[id=$id, text=$text]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'text'] = this.text;
    return json;
  }

  /// Clones this instance of [DailyPromptResponse] and returns a new one where some of the
  /// properties have changed.
  DailyPromptResponse copyWith({
    String? id,
    String? text,
  }) => DailyPromptResponse(
    id: id ?? this.id,
    text: text ?? this.text,
  );

  /// Returns a new [DailyPromptResponse] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static DailyPromptResponse? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "DailyPromptResponse[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "DailyPromptResponse[id]" has a null value in JSON.');
        assert(json.containsKey(r'text'), 'Required key "DailyPromptResponse[text]" is missing from JSON.');
        assert(json[r'text'] != null, 'Required key "DailyPromptResponse[text]" has a null value in JSON.');
        return true;
      }());

      return DailyPromptResponse(
        id: mapValueOfType<String>(json, r'id')!,
        text: mapValueOfType<String>(json, r'text')!,
      );
    }
    return null;
  }

  static List<DailyPromptResponse> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <DailyPromptResponse>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = DailyPromptResponse.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, DailyPromptResponse> mapFromJson(dynamic json) {
    final map = <String, DailyPromptResponse>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = DailyPromptResponse.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of DailyPromptResponse-objects as value to a dart map
  static Map<String, List<DailyPromptResponse>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<DailyPromptResponse>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = DailyPromptResponse.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'text',
  };
}

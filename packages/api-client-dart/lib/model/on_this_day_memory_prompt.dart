//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class OnThisDayMemoryPrompt {
  /// Returns a new [OnThisDayMemoryPrompt] instance.
  OnThisDayMemoryPrompt({
    required this.id,
    required this.text,
  });

  final String id;

  final String text;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is OnThisDayMemoryPrompt && other.id == id && other.text == text;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) + (text.hashCode);

  @override
  String toString() => 'OnThisDayMemoryPrompt[id=$id, text=$text]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'text'] = this.text;
    return json;
  }

  /// Clones this instance of [OnThisDayMemoryPrompt] and returns a new one where some of the
  /// properties have changed.
  OnThisDayMemoryPrompt copyWith({
    String? id,
    String? text,
  }) =>
      OnThisDayMemoryPrompt(
        id: id ?? this.id,
        text: text ?? this.text,
      );

  /// Returns a new [OnThisDayMemoryPrompt] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static OnThisDayMemoryPrompt? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "OnThisDayMemoryPrompt[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "OnThisDayMemoryPrompt[id]" has a null value in JSON.');
        assert(json.containsKey(r'text'),
            'Required key "OnThisDayMemoryPrompt[text]" is missing from JSON.');
        assert(json[r'text'] != null,
            'Required key "OnThisDayMemoryPrompt[text]" has a null value in JSON.');
        return true;
      }());

      return OnThisDayMemoryPrompt(
        id: mapValueOfType<String>(json, r'id')!,
        text: mapValueOfType<String>(json, r'text')!,
      );
    }
    return null;
  }

  static List<OnThisDayMemoryPrompt> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <OnThisDayMemoryPrompt>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = OnThisDayMemoryPrompt.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, OnThisDayMemoryPrompt> mapFromJson(dynamic json) {
    final map = <String, OnThisDayMemoryPrompt>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = OnThisDayMemoryPrompt.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of OnThisDayMemoryPrompt-objects as value to a dart map
  static Map<String, List<OnThisDayMemoryPrompt>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<OnThisDayMemoryPrompt>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = OnThisDayMemoryPrompt.listFromJson(
          entry.value,
          growable: growable,
        );
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

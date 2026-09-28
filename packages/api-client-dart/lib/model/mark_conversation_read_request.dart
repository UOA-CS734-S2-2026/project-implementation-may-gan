//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MarkConversationReadRequest {
  /// Returns a new [MarkConversationReadRequest] instance.
  MarkConversationReadRequest({
    required this.throughSequence,
  });

  final String throughSequence;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MarkConversationReadRequest &&
          other.throughSequence == throughSequence;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (throughSequence.hashCode);

  @override
  String toString() =>
      'MarkConversationReadRequest[throughSequence=$throughSequence]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'throughSequence'] = this.throughSequence;
    return json;
  }

  /// Clones this instance of [MarkConversationReadRequest] and returns a new one where some of the
  /// properties have changed.
  MarkConversationReadRequest copyWith({
    String? throughSequence,
  }) =>
      MarkConversationReadRequest(
        throughSequence: throughSequence ?? this.throughSequence,
      );

  /// Returns a new [MarkConversationReadRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MarkConversationReadRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'throughSequence'),
            'Required key "MarkConversationReadRequest[throughSequence]" is missing from JSON.');
        assert(json[r'throughSequence'] != null,
            'Required key "MarkConversationReadRequest[throughSequence]" has a null value in JSON.');
        return true;
      }());

      return MarkConversationReadRequest(
        throughSequence: mapValueOfType<String>(json, r'throughSequence')!,
      );
    }
    return null;
  }

  static List<MarkConversationReadRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <MarkConversationReadRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MarkConversationReadRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MarkConversationReadRequest> mapFromJson(dynamic json) {
    final map = <String, MarkConversationReadRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MarkConversationReadRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MarkConversationReadRequest-objects as value to a dart map
  static Map<String, List<MarkConversationReadRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<MarkConversationReadRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MarkConversationReadRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'throughSequence',
  };
}

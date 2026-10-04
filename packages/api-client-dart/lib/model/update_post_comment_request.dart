//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UpdatePostCommentRequest {
  /// Returns a new [UpdatePostCommentRequest] instance.
  UpdatePostCommentRequest({
    required this.text,
  });

  final String text;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UpdatePostCommentRequest && other.text == text;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (text.hashCode);

  @override
  String toString() => 'UpdatePostCommentRequest[text=$text]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'text'] = this.text;
    return json;
  }

  /// Clones this instance of [UpdatePostCommentRequest] and returns a new one where some of the
  /// properties have changed.
  UpdatePostCommentRequest copyWith({
    String? text,
  }) =>
      UpdatePostCommentRequest(
        text: text ?? this.text,
      );

  /// Returns a new [UpdatePostCommentRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UpdatePostCommentRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'text'),
            'Required key "UpdatePostCommentRequest[text]" is missing from JSON.');
        assert(json[r'text'] != null,
            'Required key "UpdatePostCommentRequest[text]" has a null value in JSON.');
        return true;
      }());

      return UpdatePostCommentRequest(
        text: mapValueOfType<String>(json, r'text')!,
      );
    }
    return null;
  }

  static List<UpdatePostCommentRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <UpdatePostCommentRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UpdatePostCommentRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UpdatePostCommentRequest> mapFromJson(dynamic json) {
    final map = <String, UpdatePostCommentRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UpdatePostCommentRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UpdatePostCommentRequest-objects as value to a dart map
  static Map<String, List<UpdatePostCommentRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<UpdatePostCommentRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UpdatePostCommentRequest.listFromJson(
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
  };
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreatePostCommentRequest {
  /// Returns a new [CreatePostCommentRequest] instance.
  CreatePostCommentRequest({
    required this.clientCommentId,
    required this.text,
    this.parentCommentId,
  });

  /// A client-generated ID, such as a UUID, reused for every retry of this comment. A retry returns the comment already made.
  final String clientCommentId;

  final String text;

  /// Replies to this top-level comment on the same post. Replies to replies are not allowed.
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? parentCommentId;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CreatePostCommentRequest &&
          other.clientCommentId == clientCommentId &&
          other.text == text &&
          other.parentCommentId == parentCommentId;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (clientCommentId.hashCode) +
      (text.hashCode) +
      (parentCommentId == null ? 0 : parentCommentId!.hashCode);

  @override
  String toString() =>
      'CreatePostCommentRequest[clientCommentId=$clientCommentId, text=$text, parentCommentId=$parentCommentId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'clientCommentId'] = this.clientCommentId;
    json[r'text'] = this.text;
    if (this.parentCommentId != null) {
      json[r'parentCommentId'] = this.parentCommentId;
    } else {
      json[r'parentCommentId'] = null;
    }
    return json;
  }

  /// Clones this instance of [CreatePostCommentRequest] and returns a new one where some of the
  /// properties have changed.
  CreatePostCommentRequest copyWith({
    String? clientCommentId,
    String? text,
    String? parentCommentId,
  }) =>
      CreatePostCommentRequest(
        clientCommentId: clientCommentId ?? this.clientCommentId,
        text: text ?? this.text,
        parentCommentId: parentCommentId ?? this.parentCommentId,
      );

  /// Returns a new [CreatePostCommentRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreatePostCommentRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'clientCommentId'),
            'Required key "CreatePostCommentRequest[clientCommentId]" is missing from JSON.');
        assert(json[r'clientCommentId'] != null,
            'Required key "CreatePostCommentRequest[clientCommentId]" has a null value in JSON.');
        assert(json.containsKey(r'text'),
            'Required key "CreatePostCommentRequest[text]" is missing from JSON.');
        assert(json[r'text'] != null,
            'Required key "CreatePostCommentRequest[text]" has a null value in JSON.');
        return true;
      }());

      return CreatePostCommentRequest(
        clientCommentId: mapValueOfType<String>(json, r'clientCommentId')!,
        text: mapValueOfType<String>(json, r'text')!,
        parentCommentId: mapValueOfType<String>(json, r'parentCommentId'),
      );
    }
    return null;
  }

  static List<CreatePostCommentRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <CreatePostCommentRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreatePostCommentRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreatePostCommentRequest> mapFromJson(dynamic json) {
    final map = <String, CreatePostCommentRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreatePostCommentRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreatePostCommentRequest-objects as value to a dart map
  static Map<String, List<CreatePostCommentRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<CreatePostCommentRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreatePostCommentRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'clientCommentId',
    'text',
  };
}

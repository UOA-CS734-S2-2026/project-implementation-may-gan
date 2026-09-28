//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateDirectConversationRequest {
  /// Returns a new [CreateDirectConversationRequest] instance.
  CreateDirectConversationRequest({
    required this.recipientId,
    required this.clientMessageId,
    required this.text,
  });

  final String recipientId;

  final String clientMessageId;

  /// 1 through 4,000 Unicode code points. The 8,000 code-unit cap preserves valid astral Unicode text.
  final String text;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CreateDirectConversationRequest &&
          other.recipientId == recipientId &&
          other.clientMessageId == clientMessageId &&
          other.text == text;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (recipientId.hashCode) + (clientMessageId.hashCode) + (text.hashCode);

  @override
  String toString() =>
      'CreateDirectConversationRequest[recipientId=$recipientId, clientMessageId=$clientMessageId, text=$text]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'recipientId'] = this.recipientId;
    json[r'clientMessageId'] = this.clientMessageId;
    json[r'text'] = this.text;
    return json;
  }

  /// Clones this instance of [CreateDirectConversationRequest] and returns a new one where some of the
  /// properties have changed.
  CreateDirectConversationRequest copyWith({
    String? recipientId,
    String? clientMessageId,
    String? text,
  }) =>
      CreateDirectConversationRequest(
        recipientId: recipientId ?? this.recipientId,
        clientMessageId: clientMessageId ?? this.clientMessageId,
        text: text ?? this.text,
      );

  /// Returns a new [CreateDirectConversationRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateDirectConversationRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'recipientId'),
            'Required key "CreateDirectConversationRequest[recipientId]" is missing from JSON.');
        assert(json[r'recipientId'] != null,
            'Required key "CreateDirectConversationRequest[recipientId]" has a null value in JSON.');
        assert(json.containsKey(r'clientMessageId'),
            'Required key "CreateDirectConversationRequest[clientMessageId]" is missing from JSON.');
        assert(json[r'clientMessageId'] != null,
            'Required key "CreateDirectConversationRequest[clientMessageId]" has a null value in JSON.');
        assert(json.containsKey(r'text'),
            'Required key "CreateDirectConversationRequest[text]" is missing from JSON.');
        assert(json[r'text'] != null,
            'Required key "CreateDirectConversationRequest[text]" has a null value in JSON.');
        return true;
      }());

      return CreateDirectConversationRequest(
        recipientId: mapValueOfType<String>(json, r'recipientId')!,
        clientMessageId: mapValueOfType<String>(json, r'clientMessageId')!,
        text: mapValueOfType<String>(json, r'text')!,
      );
    }
    return null;
  }

  static List<CreateDirectConversationRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <CreateDirectConversationRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreateDirectConversationRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateDirectConversationRequest> mapFromJson(
      dynamic json) {
    final map = <String, CreateDirectConversationRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateDirectConversationRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateDirectConversationRequest-objects as value to a dart map
  static Map<String, List<CreateDirectConversationRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<CreateDirectConversationRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreateDirectConversationRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'recipientId',
    'clientMessageId',
    'text',
  };
}

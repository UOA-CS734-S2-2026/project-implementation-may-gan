//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateDirectConversation200Response {
  /// Returns a new [CreateDirectConversation200Response] instance.
  CreateDirectConversation200Response({
    required this.conversation,
    required this.message,
  });

  final CreateDirectConversation200ResponseConversation conversation;

  final Message message;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CreateDirectConversation200Response &&
          other.conversation == conversation &&
          other.message == message;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (conversation.hashCode) + (message.hashCode);

  @override
  String toString() =>
      'CreateDirectConversation200Response[conversation=$conversation, message=$message]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'conversation'] = this.conversation;
    json[r'message'] = this.message;
    return json;
  }

  /// Clones this instance of [CreateDirectConversation200Response] and returns a new one where some of the
  /// properties have changed.
  CreateDirectConversation200Response copyWith({
    CreateDirectConversation200ResponseConversation? conversation,
    Message? message,
  }) =>
      CreateDirectConversation200Response(
        conversation: conversation ?? this.conversation,
        message: message ?? this.message,
      );

  /// Returns a new [CreateDirectConversation200Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateDirectConversation200Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'conversation'),
            'Required key "CreateDirectConversation200Response[conversation]" is missing from JSON.');
        assert(json[r'conversation'] != null,
            'Required key "CreateDirectConversation200Response[conversation]" has a null value in JSON.');
        assert(json.containsKey(r'message'),
            'Required key "CreateDirectConversation200Response[message]" is missing from JSON.');
        assert(json[r'message'] != null,
            'Required key "CreateDirectConversation200Response[message]" has a null value in JSON.');
        return true;
      }());

      return CreateDirectConversation200Response(
        conversation: CreateDirectConversation200ResponseConversation.fromJson(
            json[r'conversation'])!,
        message: Message.fromJson(json[r'message'])!,
      );
    }
    return null;
  }

  static List<CreateDirectConversation200Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <CreateDirectConversation200Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreateDirectConversation200Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateDirectConversation200Response> mapFromJson(
      dynamic json) {
    final map = <String, CreateDirectConversation200Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateDirectConversation200Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateDirectConversation200Response-objects as value to a dart map
  static Map<String, List<CreateDirectConversation200Response>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<CreateDirectConversation200Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreateDirectConversation200Response.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'conversation',
    'message',
  };
}

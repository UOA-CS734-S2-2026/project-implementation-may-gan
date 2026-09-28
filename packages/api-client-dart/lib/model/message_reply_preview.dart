//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MessageReplyPreview {
  /// Returns a new [MessageReplyPreview] instance.
  MessageReplyPreview({
    required this.id,
    required this.senderId,
    required this.text,
    required this.unsentAt,
  });

  final String id;

  final String senderId;

  final String text;

  final DateTime unsentAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MessageReplyPreview &&
          other.id == id &&
          other.senderId == senderId &&
          other.text == text &&
          other.unsentAt == unsentAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (senderId.hashCode) +
      (text.hashCode) +
      (unsentAt.hashCode);

  @override
  String toString() =>
      'MessageReplyPreview[id=$id, senderId=$senderId, text=$text, unsentAt=$unsentAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'senderId'] = this.senderId;
    json[r'text'] = this.text;
    json[r'unsentAt'] = this.unsentAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [MessageReplyPreview] and returns a new one where some of the
  /// properties have changed.
  MessageReplyPreview copyWith({
    String? id,
    String? senderId,
    String? text,
    DateTime? unsentAt,
  }) =>
      MessageReplyPreview(
        id: id ?? this.id,
        senderId: senderId ?? this.senderId,
        text: text ?? this.text,
        unsentAt: unsentAt ?? this.unsentAt,
      );

  /// Returns a new [MessageReplyPreview] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MessageReplyPreview? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "MessageReplyPreview[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "MessageReplyPreview[id]" has a null value in JSON.');
        assert(json.containsKey(r'senderId'),
            'Required key "MessageReplyPreview[senderId]" is missing from JSON.');
        assert(json[r'senderId'] != null,
            'Required key "MessageReplyPreview[senderId]" has a null value in JSON.');
        assert(json.containsKey(r'text'),
            'Required key "MessageReplyPreview[text]" is missing from JSON.');
        assert(json[r'text'] != null,
            'Required key "MessageReplyPreview[text]" has a null value in JSON.');
        assert(json.containsKey(r'unsentAt'),
            'Required key "MessageReplyPreview[unsentAt]" is missing from JSON.');
        assert(json[r'unsentAt'] != null,
            'Required key "MessageReplyPreview[unsentAt]" has a null value in JSON.');
        return true;
      }());

      return MessageReplyPreview(
        id: mapValueOfType<String>(json, r'id')!,
        senderId: mapValueOfType<String>(json, r'senderId')!,
        text: mapValueOfType<String>(json, r'text')!,
        unsentAt: mapDateTime(json, r'unsentAt', r'')!,
      );
    }
    return null;
  }

  static List<MessageReplyPreview> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <MessageReplyPreview>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MessageReplyPreview.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MessageReplyPreview> mapFromJson(dynamic json) {
    final map = <String, MessageReplyPreview>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MessageReplyPreview.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MessageReplyPreview-objects as value to a dart map
  static Map<String, List<MessageReplyPreview>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<MessageReplyPreview>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MessageReplyPreview.listFromJson(
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
    'senderId',
    'text',
    'unsentAt',
  };
}

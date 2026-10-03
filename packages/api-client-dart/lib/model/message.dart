//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class Message {
  /// Returns a new [Message] instance.
  Message({
    required this.id,
    required this.conversationId,
    required this.sequence,
    required this.senderId,
    required this.clientMessageId,
    required this.text,
    required this.replyToMessageId,
    required this.replyPreview,
    required this.version,
    required this.createdAt,
    required this.editedAt,
    required this.unsentAt,
    this.reactions = const [],
  });

  final String id;

  final String conversationId;

  final String sequence;

  final String senderId;

  final String clientMessageId;

  final String? text;

  final String? replyToMessageId;

  final MessageReplyPreview? replyPreview;

  /// Minimum value: 1
  final int version;

  final DateTime createdAt;

  final DateTime? editedAt;

  final DateTime? unsentAt;

  final List<MessageReactionsInner> reactions;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Message &&
          other.id == id &&
          other.conversationId == conversationId &&
          other.sequence == sequence &&
          other.senderId == senderId &&
          other.clientMessageId == clientMessageId &&
          other.text == text &&
          other.replyToMessageId == replyToMessageId &&
          other.replyPreview == replyPreview &&
          other.version == version &&
          other.createdAt == createdAt &&
          other.editedAt == editedAt &&
          other.unsentAt == unsentAt &&
          _deepEquality.equals(other.reactions, reactions);

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (conversationId.hashCode) +
      (sequence.hashCode) +
      (senderId.hashCode) +
      (clientMessageId.hashCode) +
      (text == null ? 0 : text!.hashCode) +
      (replyToMessageId == null ? 0 : replyToMessageId!.hashCode) +
      (replyPreview == null ? 0 : replyPreview!.hashCode) +
      (version.hashCode) +
      (createdAt.hashCode) +
      (editedAt == null ? 0 : editedAt!.hashCode) +
      (unsentAt == null ? 0 : unsentAt!.hashCode) +
      (reactions.hashCode);

  @override
  String toString() =>
      'Message[id=$id, conversationId=$conversationId, sequence=$sequence, senderId=$senderId, clientMessageId=$clientMessageId, text=$text, replyToMessageId=$replyToMessageId, replyPreview=$replyPreview, version=$version, createdAt=$createdAt, editedAt=$editedAt, unsentAt=$unsentAt, reactions=$reactions]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'conversationId'] = this.conversationId;
    json[r'sequence'] = this.sequence;
    json[r'senderId'] = this.senderId;
    json[r'clientMessageId'] = this.clientMessageId;
    if (this.text != null) {
      json[r'text'] = this.text;
    } else {
      json[r'text'] = null;
    }
    if (this.replyToMessageId != null) {
      json[r'replyToMessageId'] = this.replyToMessageId;
    } else {
      json[r'replyToMessageId'] = null;
    }
    if (this.replyPreview != null) {
      json[r'replyPreview'] = this.replyPreview;
    } else {
      json[r'replyPreview'] = null;
    }
    json[r'version'] = this.version;
    json[r'createdAt'] = this.createdAt.toUtc().toIso8601String();
    if (this.editedAt != null) {
      json[r'editedAt'] = this.editedAt!.toUtc().toIso8601String();
    } else {
      json[r'editedAt'] = null;
    }
    if (this.unsentAt != null) {
      json[r'unsentAt'] = this.unsentAt!.toUtc().toIso8601String();
    } else {
      json[r'unsentAt'] = null;
    }
    json[r'reactions'] = this.reactions;
    return json;
  }

  /// Clones this instance of [Message] and returns a new one where some of the
  /// properties have changed.
  Message copyWith({
    String? id,
    String? conversationId,
    String? sequence,
    String? senderId,
    String? clientMessageId,
    String? text,
    bool textSetToNull = false,
    String? replyToMessageId,
    bool replyToMessageIdSetToNull = false,
    MessageReplyPreview? replyPreview,
    bool replyPreviewSetToNull = false,
    int? version,
    DateTime? createdAt,
    DateTime? editedAt,
    bool editedAtSetToNull = false,
    DateTime? unsentAt,
    bool unsentAtSetToNull = false,
    List<MessageReactionsInner>? reactions,
  }) =>
      Message(
        id: id ?? this.id,
        conversationId: conversationId ?? this.conversationId,
        sequence: sequence ?? this.sequence,
        senderId: senderId ?? this.senderId,
        clientMessageId: clientMessageId ?? this.clientMessageId,
        text: textSetToNull ? null : text ?? this.text,
        replyToMessageId: replyToMessageIdSetToNull
            ? null
            : replyToMessageId ?? this.replyToMessageId,
        replyPreview:
            replyPreviewSetToNull ? null : replyPreview ?? this.replyPreview,
        version: version ?? this.version,
        createdAt: createdAt ?? this.createdAt,
        editedAt: editedAtSetToNull ? null : editedAt ?? this.editedAt,
        unsentAt: unsentAtSetToNull ? null : unsentAt ?? this.unsentAt,
        reactions: reactions ?? this.reactions,
      );

  /// Returns a new [Message] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static Message? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "Message[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "Message[id]" has a null value in JSON.');
        assert(json.containsKey(r'conversationId'),
            'Required key "Message[conversationId]" is missing from JSON.');
        assert(json[r'conversationId'] != null,
            'Required key "Message[conversationId]" has a null value in JSON.');
        assert(json.containsKey(r'sequence'),
            'Required key "Message[sequence]" is missing from JSON.');
        assert(json[r'sequence'] != null,
            'Required key "Message[sequence]" has a null value in JSON.');
        assert(json.containsKey(r'senderId'),
            'Required key "Message[senderId]" is missing from JSON.');
        assert(json[r'senderId'] != null,
            'Required key "Message[senderId]" has a null value in JSON.');
        assert(json.containsKey(r'clientMessageId'),
            'Required key "Message[clientMessageId]" is missing from JSON.');
        assert(json[r'clientMessageId'] != null,
            'Required key "Message[clientMessageId]" has a null value in JSON.');
        assert(json.containsKey(r'text'),
            'Required key "Message[text]" is missing from JSON.');
        assert(json.containsKey(r'replyToMessageId'),
            'Required key "Message[replyToMessageId]" is missing from JSON.');
        assert(json.containsKey(r'replyPreview'),
            'Required key "Message[replyPreview]" is missing from JSON.');
        assert(json.containsKey(r'version'),
            'Required key "Message[version]" is missing from JSON.');
        assert(json[r'version'] != null,
            'Required key "Message[version]" has a null value in JSON.');
        assert(json.containsKey(r'createdAt'),
            'Required key "Message[createdAt]" is missing from JSON.');
        assert(json[r'createdAt'] != null,
            'Required key "Message[createdAt]" has a null value in JSON.');
        assert(json.containsKey(r'editedAt'),
            'Required key "Message[editedAt]" is missing from JSON.');
        assert(json.containsKey(r'unsentAt'),
            'Required key "Message[unsentAt]" is missing from JSON.');
        assert(json.containsKey(r'reactions'),
            'Required key "Message[reactions]" is missing from JSON.');
        assert(json[r'reactions'] != null,
            'Required key "Message[reactions]" has a null value in JSON.');
        return true;
      }());

      return Message(
        id: mapValueOfType<String>(json, r'id')!,
        conversationId: mapValueOfType<String>(json, r'conversationId')!,
        sequence: mapValueOfType<String>(json, r'sequence')!,
        senderId: mapValueOfType<String>(json, r'senderId')!,
        clientMessageId: mapValueOfType<String>(json, r'clientMessageId')!,
        text: mapValueOfType<String>(json, r'text'),
        replyToMessageId: mapValueOfType<String>(json, r'replyToMessageId'),
        replyPreview: MessageReplyPreview.fromJson(json[r'replyPreview']),
        version: mapValueOfType<int>(json, r'version')!,
        createdAt: mapDateTime(json, r'createdAt', r'')!,
        editedAt: mapDateTime(json, r'editedAt', r''),
        unsentAt: mapDateTime(json, r'unsentAt', r''),
        reactions: MessageReactionsInner.listFromJson(json[r'reactions']),
      );
    }
    return null;
  }

  static List<Message> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <Message>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = Message.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, Message> mapFromJson(dynamic json) {
    final map = <String, Message>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = Message.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of Message-objects as value to a dart map
  static Map<String, List<Message>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<Message>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = Message.listFromJson(
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
    'conversationId',
    'sequence',
    'senderId',
    'clientMessageId',
    'text',
    'replyToMessageId',
    'replyPreview',
    'version',
    'createdAt',
    'editedAt',
    'unsentAt',
    'reactions',
  };
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class Conversation {
  /// Returns a new [Conversation] instance.
  Conversation({
    required this.id,
    required this.peer,
    required this.requestState,
    required this.latestMessage,
    required this.unreadCount,
    required this.lastMessageSequence,
    required this.lastChangeSequence,
    required this.lastReadSequence,
    required this.receiptSequence,
    required this.capabilities,
    required this.updatedAt,
  });

  final String id;

  final CreateDirectConversation200ResponseConversationPeer peer;

  final ConversationRequestStateEnum requestState;

  final Message latestMessage;

  /// Minimum value: 0
  final int unreadCount;

  final String lastMessageSequence;

  final String lastChangeSequence;

  final String lastReadSequence;

  final String receiptSequence;

  final ConversationCapabilities capabilities;

  final DateTime updatedAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Conversation &&
          other.id == id &&
          other.peer == peer &&
          other.requestState == requestState &&
          other.latestMessage == latestMessage &&
          other.unreadCount == unreadCount &&
          other.lastMessageSequence == lastMessageSequence &&
          other.lastChangeSequence == lastChangeSequence &&
          other.lastReadSequence == lastReadSequence &&
          other.receiptSequence == receiptSequence &&
          other.capabilities == capabilities &&
          other.updatedAt == updatedAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (peer.hashCode) +
      (requestState.hashCode) +
      (latestMessage.hashCode) +
      (unreadCount.hashCode) +
      (lastMessageSequence.hashCode) +
      (lastChangeSequence.hashCode) +
      (lastReadSequence.hashCode) +
      (receiptSequence.hashCode) +
      (capabilities.hashCode) +
      (updatedAt.hashCode);

  @override
  String toString() =>
      'Conversation[id=$id, peer=$peer, requestState=$requestState, latestMessage=$latestMessage, unreadCount=$unreadCount, lastMessageSequence=$lastMessageSequence, lastChangeSequence=$lastChangeSequence, lastReadSequence=$lastReadSequence, receiptSequence=$receiptSequence, capabilities=$capabilities, updatedAt=$updatedAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'peer'] = this.peer;
    json[r'requestState'] = this.requestState;
    json[r'latestMessage'] = this.latestMessage;
    json[r'unreadCount'] = this.unreadCount;
    json[r'lastMessageSequence'] = this.lastMessageSequence;
    json[r'lastChangeSequence'] = this.lastChangeSequence;
    json[r'lastReadSequence'] = this.lastReadSequence;
    json[r'receiptSequence'] = this.receiptSequence;
    json[r'capabilities'] = this.capabilities;
    json[r'updatedAt'] = this.updatedAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [Conversation] and returns a new one where some of the
  /// properties have changed.
  Conversation copyWith({
    String? id,
    CreateDirectConversation200ResponseConversationPeer? peer,
    ConversationRequestStateEnum? requestState,
    Message? latestMessage,
    int? unreadCount,
    String? lastMessageSequence,
    String? lastChangeSequence,
    String? lastReadSequence,
    String? receiptSequence,
    ConversationCapabilities? capabilities,
    DateTime? updatedAt,
  }) =>
      Conversation(
        id: id ?? this.id,
        peer: peer ?? this.peer,
        requestState: requestState ?? this.requestState,
        latestMessage: latestMessage ?? this.latestMessage,
        unreadCount: unreadCount ?? this.unreadCount,
        lastMessageSequence: lastMessageSequence ?? this.lastMessageSequence,
        lastChangeSequence: lastChangeSequence ?? this.lastChangeSequence,
        lastReadSequence: lastReadSequence ?? this.lastReadSequence,
        receiptSequence: receiptSequence ?? this.receiptSequence,
        capabilities: capabilities ?? this.capabilities,
        updatedAt: updatedAt ?? this.updatedAt,
      );

  /// Returns a new [Conversation] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static Conversation? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "Conversation[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "Conversation[id]" has a null value in JSON.');
        assert(json.containsKey(r'peer'),
            'Required key "Conversation[peer]" is missing from JSON.');
        assert(json[r'peer'] != null,
            'Required key "Conversation[peer]" has a null value in JSON.');
        assert(json.containsKey(r'requestState'),
            'Required key "Conversation[requestState]" is missing from JSON.');
        assert(json[r'requestState'] != null,
            'Required key "Conversation[requestState]" has a null value in JSON.');
        assert(json.containsKey(r'latestMessage'),
            'Required key "Conversation[latestMessage]" is missing from JSON.');
        assert(json[r'latestMessage'] != null,
            'Required key "Conversation[latestMessage]" has a null value in JSON.');
        assert(json.containsKey(r'unreadCount'),
            'Required key "Conversation[unreadCount]" is missing from JSON.');
        assert(json[r'unreadCount'] != null,
            'Required key "Conversation[unreadCount]" has a null value in JSON.');
        assert(json.containsKey(r'lastMessageSequence'),
            'Required key "Conversation[lastMessageSequence]" is missing from JSON.');
        assert(json[r'lastMessageSequence'] != null,
            'Required key "Conversation[lastMessageSequence]" has a null value in JSON.');
        assert(json.containsKey(r'lastChangeSequence'),
            'Required key "Conversation[lastChangeSequence]" is missing from JSON.');
        assert(json[r'lastChangeSequence'] != null,
            'Required key "Conversation[lastChangeSequence]" has a null value in JSON.');
        assert(json.containsKey(r'lastReadSequence'),
            'Required key "Conversation[lastReadSequence]" is missing from JSON.');
        assert(json[r'lastReadSequence'] != null,
            'Required key "Conversation[lastReadSequence]" has a null value in JSON.');
        assert(json.containsKey(r'receiptSequence'),
            'Required key "Conversation[receiptSequence]" is missing from JSON.');
        assert(json[r'receiptSequence'] != null,
            'Required key "Conversation[receiptSequence]" has a null value in JSON.');
        assert(json.containsKey(r'capabilities'),
            'Required key "Conversation[capabilities]" is missing from JSON.');
        assert(json[r'capabilities'] != null,
            'Required key "Conversation[capabilities]" has a null value in JSON.');
        assert(json.containsKey(r'updatedAt'),
            'Required key "Conversation[updatedAt]" is missing from JSON.');
        assert(json[r'updatedAt'] != null,
            'Required key "Conversation[updatedAt]" has a null value in JSON.');
        return true;
      }());

      return Conversation(
        id: mapValueOfType<String>(json, r'id')!,
        peer: CreateDirectConversation200ResponseConversationPeer.fromJson(
            json[r'peer'])!,
        requestState:
            ConversationRequestStateEnum.fromJson(json[r'requestState'])!,
        latestMessage: Message.fromJson(json[r'latestMessage'])!,
        unreadCount: mapValueOfType<int>(json, r'unreadCount')!,
        lastMessageSequence:
            mapValueOfType<String>(json, r'lastMessageSequence')!,
        lastChangeSequence:
            mapValueOfType<String>(json, r'lastChangeSequence')!,
        lastReadSequence: mapValueOfType<String>(json, r'lastReadSequence')!,
        receiptSequence: mapValueOfType<String>(json, r'receiptSequence')!,
        capabilities: ConversationCapabilities.fromJson(json[r'capabilities'])!,
        updatedAt: mapDateTime(json, r'updatedAt', r'')!,
      );
    }
    return null;
  }

  static List<Conversation> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <Conversation>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = Conversation.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, Conversation> mapFromJson(dynamic json) {
    final map = <String, Conversation>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = Conversation.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of Conversation-objects as value to a dart map
  static Map<String, List<Conversation>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<Conversation>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = Conversation.listFromJson(
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
    'peer',
    'requestState',
    'latestMessage',
    'unreadCount',
    'lastMessageSequence',
    'lastChangeSequence',
    'lastReadSequence',
    'receiptSequence',
    'capabilities',
    'updatedAt',
  };
}

enum ConversationRequestStateEnum {
  pending._(r'pending'),
  active._(r'active'),
  declined._(r'declined'),
  ;

  /// Instantiate a new enum with the provided value.
  const ConversationRequestStateEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [ConversationRequestStateEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static ConversationRequestStateEnum? fromJson(dynamic value) =>
      ConversationRequestStateEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [ConversationRequestStateEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<ConversationRequestStateEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ConversationRequestStateEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ConversationRequestStateEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ConversationRequestStateEnum] to String,
/// and [decode] dynamic data back to [ConversationRequestStateEnum].
class ConversationRequestStateEnumTypeTransformer {
  factory ConversationRequestStateEnumTypeTransformer() =>
      _instance ??= const ConversationRequestStateEnumTypeTransformer._();

  const ConversationRequestStateEnumTypeTransformer._();

  String encode(ConversationRequestStateEnum data) => data._value;

  /// Returns the instance of [ConversationRequestStateEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ConversationRequestStateEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is ConversationRequestStateEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'pending':
          return ConversationRequestStateEnum.pending;
        case r'active':
          return ConversationRequestStateEnum.active;
        case r'declined':
          return ConversationRequestStateEnum.declined;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static ConversationRequestStateEnumTypeTransformer? _instance;
}

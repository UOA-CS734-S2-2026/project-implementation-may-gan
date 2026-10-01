//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MessageReactionsInner {
  /// Returns a new [MessageReactionsInner] instance.
  MessageReactionsInner({
    required this.reaction,
    required this.count,
    required this.reactedByActor,
    this.reactors = const [],
  });

  final MessageReactionsInnerReactionEnum reaction;

  /// Minimum value: 1
  final int count;

  final bool reactedByActor;

  final List<MessageReactionsInnerReactorsInner> reactors;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MessageReactionsInner &&
          other.reaction == reaction &&
          other.count == count &&
          other.reactedByActor == reactedByActor &&
          _deepEquality.equals(other.reactors, reactors);

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (reaction.hashCode) +
      (count.hashCode) +
      (reactedByActor.hashCode) +
      (reactors.hashCode);

  @override
  String toString() =>
      'MessageReactionsInner[reaction=$reaction, count=$count, reactedByActor=$reactedByActor, reactors=$reactors]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'reaction'] = this.reaction;
    json[r'count'] = this.count;
    json[r'reactedByActor'] = this.reactedByActor;
    json[r'reactors'] = this.reactors;
    return json;
  }

  /// Clones this instance of [MessageReactionsInner] and returns a new one where some of the
  /// properties have changed.
  MessageReactionsInner copyWith({
    MessageReactionsInnerReactionEnum? reaction,
    int? count,
    bool? reactedByActor,
    List<MessageReactionsInnerReactorsInner>? reactors,
  }) =>
      MessageReactionsInner(
        reaction: reaction ?? this.reaction,
        count: count ?? this.count,
        reactedByActor: reactedByActor ?? this.reactedByActor,
        reactors: reactors ?? this.reactors,
      );

  /// Returns a new [MessageReactionsInner] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MessageReactionsInner? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'reaction'),
            'Required key "MessageReactionsInner[reaction]" is missing from JSON.');
        assert(json[r'reaction'] != null,
            'Required key "MessageReactionsInner[reaction]" has a null value in JSON.');
        assert(json.containsKey(r'count'),
            'Required key "MessageReactionsInner[count]" is missing from JSON.');
        assert(json[r'count'] != null,
            'Required key "MessageReactionsInner[count]" has a null value in JSON.');
        assert(json.containsKey(r'reactedByActor'),
            'Required key "MessageReactionsInner[reactedByActor]" is missing from JSON.');
        assert(json[r'reactedByActor'] != null,
            'Required key "MessageReactionsInner[reactedByActor]" has a null value in JSON.');
        assert(json.containsKey(r'reactors'),
            'Required key "MessageReactionsInner[reactors]" is missing from JSON.');
        assert(json[r'reactors'] != null,
            'Required key "MessageReactionsInner[reactors]" has a null value in JSON.');
        return true;
      }());

      return MessageReactionsInner(
        reaction:
            MessageReactionsInnerReactionEnum.fromJson(json[r'reaction'])!,
        count: mapValueOfType<int>(json, r'count')!,
        reactedByActor: mapValueOfType<bool>(json, r'reactedByActor')!,
        reactors:
            MessageReactionsInnerReactorsInner.listFromJson(json[r'reactors']),
      );
    }
    return null;
  }

  static List<MessageReactionsInner> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <MessageReactionsInner>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MessageReactionsInner.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MessageReactionsInner> mapFromJson(dynamic json) {
    final map = <String, MessageReactionsInner>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MessageReactionsInner.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MessageReactionsInner-objects as value to a dart map
  static Map<String, List<MessageReactionsInner>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<MessageReactionsInner>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MessageReactionsInner.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'reaction',
    'count',
    'reactedByActor',
    'reactors',
  };
}

enum MessageReactionsInnerReactionEnum {
  like._(r'like'),
  love._(r'love'),
  laugh._(r'laugh'),
  surprised._(r'surprised'),
  sad._(r'sad'),
  angry._(r'angry'),
  thanks._(r'thanks'),
  ;

  /// Instantiate a new enum with the provided value.
  const MessageReactionsInnerReactionEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [MessageReactionsInnerReactionEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static MessageReactionsInnerReactionEnum? fromJson(dynamic value) =>
      MessageReactionsInnerReactionEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [MessageReactionsInnerReactionEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<MessageReactionsInnerReactionEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <MessageReactionsInnerReactionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MessageReactionsInnerReactionEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MessageReactionsInnerReactionEnum] to String,
/// and [decode] dynamic data back to [MessageReactionsInnerReactionEnum].
class MessageReactionsInnerReactionEnumTypeTransformer {
  factory MessageReactionsInnerReactionEnumTypeTransformer() =>
      _instance ??= const MessageReactionsInnerReactionEnumTypeTransformer._();

  const MessageReactionsInnerReactionEnumTypeTransformer._();

  String encode(MessageReactionsInnerReactionEnum data) => data._value;

  /// Returns the instance of [MessageReactionsInnerReactionEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MessageReactionsInnerReactionEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is MessageReactionsInnerReactionEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'like':
          return MessageReactionsInnerReactionEnum.like;
        case r'love':
          return MessageReactionsInnerReactionEnum.love;
        case r'laugh':
          return MessageReactionsInnerReactionEnum.laugh;
        case r'surprised':
          return MessageReactionsInnerReactionEnum.surprised;
        case r'sad':
          return MessageReactionsInnerReactionEnum.sad;
        case r'angry':
          return MessageReactionsInnerReactionEnum.angry;
        case r'thanks':
          return MessageReactionsInnerReactionEnum.thanks;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static MessageReactionsInnerReactionEnumTypeTransformer? _instance;
}

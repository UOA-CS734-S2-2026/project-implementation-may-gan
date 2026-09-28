//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateDirectConversation200ResponseConversation {
  /// Returns a new [CreateDirectConversation200ResponseConversation] instance.
  CreateDirectConversation200ResponseConversation({
    required this.id,
    required this.peer,
    required this.requestState,
  });

  final String id;

  final CreateDirectConversation200ResponseConversationPeer peer;

  final CreateDirectConversation200ResponseConversationRequestStateEnum
      requestState;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CreateDirectConversation200ResponseConversation &&
          other.id == id &&
          other.peer == peer &&
          other.requestState == requestState;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) + (peer.hashCode) + (requestState.hashCode);

  @override
  String toString() =>
      'CreateDirectConversation200ResponseConversation[id=$id, peer=$peer, requestState=$requestState]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'peer'] = this.peer;
    json[r'requestState'] = this.requestState;
    return json;
  }

  /// Clones this instance of [CreateDirectConversation200ResponseConversation] and returns a new one where some of the
  /// properties have changed.
  CreateDirectConversation200ResponseConversation copyWith({
    String? id,
    CreateDirectConversation200ResponseConversationPeer? peer,
    CreateDirectConversation200ResponseConversationRequestStateEnum?
        requestState,
  }) =>
      CreateDirectConversation200ResponseConversation(
        id: id ?? this.id,
        peer: peer ?? this.peer,
        requestState: requestState ?? this.requestState,
      );

  /// Returns a new [CreateDirectConversation200ResponseConversation] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateDirectConversation200ResponseConversation? fromJson(
      dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "CreateDirectConversation200ResponseConversation[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "CreateDirectConversation200ResponseConversation[id]" has a null value in JSON.');
        assert(json.containsKey(r'peer'),
            'Required key "CreateDirectConversation200ResponseConversation[peer]" is missing from JSON.');
        assert(json[r'peer'] != null,
            'Required key "CreateDirectConversation200ResponseConversation[peer]" has a null value in JSON.');
        assert(json.containsKey(r'requestState'),
            'Required key "CreateDirectConversation200ResponseConversation[requestState]" is missing from JSON.');
        assert(json[r'requestState'] != null,
            'Required key "CreateDirectConversation200ResponseConversation[requestState]" has a null value in JSON.');
        return true;
      }());

      return CreateDirectConversation200ResponseConversation(
        id: mapValueOfType<String>(json, r'id')!,
        peer: CreateDirectConversation200ResponseConversationPeer.fromJson(
            json[r'peer'])!,
        requestState:
            CreateDirectConversation200ResponseConversationRequestStateEnum
                .fromJson(json[r'requestState'])!,
      );
    }
    return null;
  }

  static List<CreateDirectConversation200ResponseConversation> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <CreateDirectConversation200ResponseConversation>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            CreateDirectConversation200ResponseConversation.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateDirectConversation200ResponseConversation>
      mapFromJson(dynamic json) {
    final map = <String, CreateDirectConversation200ResponseConversation>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateDirectConversation200ResponseConversation.fromJson(
            entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateDirectConversation200ResponseConversation-objects as value to a dart map
  static Map<String, List<CreateDirectConversation200ResponseConversation>>
      mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map =
        <String, List<CreateDirectConversation200ResponseConversation>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] =
            CreateDirectConversation200ResponseConversation.listFromJson(
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
  };
}

enum CreateDirectConversation200ResponseConversationRequestStateEnum {
  pending._(r'pending'),
  active._(r'active'),
  declined._(r'declined'),
  ;

  /// Instantiate a new enum with the provided value.
  const CreateDirectConversation200ResponseConversationRequestStateEnum._(
      this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [CreateDirectConversation200ResponseConversationRequestStateEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static CreateDirectConversation200ResponseConversationRequestStateEnum? fromJson(
          dynamic value) =>
      CreateDirectConversation200ResponseConversationRequestStateEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [CreateDirectConversation200ResponseConversationRequestStateEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<CreateDirectConversation200ResponseConversationRequestStateEnum>
      listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result =
        <CreateDirectConversation200ResponseConversationRequestStateEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value =
            CreateDirectConversation200ResponseConversationRequestStateEnum
                .fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [CreateDirectConversation200ResponseConversationRequestStateEnum] to String,
/// and [decode] dynamic data back to [CreateDirectConversation200ResponseConversationRequestStateEnum].
class CreateDirectConversation200ResponseConversationRequestStateEnumTypeTransformer {
  factory CreateDirectConversation200ResponseConversationRequestStateEnumTypeTransformer() =>
      _instance ??=
          const CreateDirectConversation200ResponseConversationRequestStateEnumTypeTransformer
              ._();

  const CreateDirectConversation200ResponseConversationRequestStateEnumTypeTransformer._();

  String encode(
          CreateDirectConversation200ResponseConversationRequestStateEnum
              data) =>
      data._value;

  /// Returns the instance of [CreateDirectConversation200ResponseConversationRequestStateEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  CreateDirectConversation200ResponseConversationRequestStateEnum? decode(
      dynamic data,
      {bool allowNull = true}) {
    if (data
        is CreateDirectConversation200ResponseConversationRequestStateEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'pending':
          return CreateDirectConversation200ResponseConversationRequestStateEnum
              .pending;
        case r'active':
          return CreateDirectConversation200ResponseConversationRequestStateEnum
              .active;
        case r'declined':
          return CreateDirectConversation200ResponseConversationRequestStateEnum
              .declined;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static CreateDirectConversation200ResponseConversationRequestStateEnumTypeTransformer?
      _instance;
}

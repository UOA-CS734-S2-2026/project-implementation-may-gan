//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class SetMessageReactionRequest {
  /// Returns a new [SetMessageReactionRequest] instance.
  SetMessageReactionRequest({
    required this.reaction,
  });

  final SetMessageReactionRequestReactionEnum reaction;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SetMessageReactionRequest && other.reaction == reaction;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (reaction.hashCode);

  @override
  String toString() => 'SetMessageReactionRequest[reaction=$reaction]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'reaction'] = this.reaction;
    return json;
  }

  /// Clones this instance of [SetMessageReactionRequest] and returns a new one where some of the
  /// properties have changed.
  SetMessageReactionRequest copyWith({
    SetMessageReactionRequestReactionEnum? reaction,
  }) =>
      SetMessageReactionRequest(
        reaction: reaction ?? this.reaction,
      );

  /// Returns a new [SetMessageReactionRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static SetMessageReactionRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'reaction'),
            'Required key "SetMessageReactionRequest[reaction]" is missing from JSON.');
        assert(json[r'reaction'] != null,
            'Required key "SetMessageReactionRequest[reaction]" has a null value in JSON.');
        return true;
      }());

      return SetMessageReactionRequest(
        reaction:
            SetMessageReactionRequestReactionEnum.fromJson(json[r'reaction'])!,
      );
    }
    return null;
  }

  static List<SetMessageReactionRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <SetMessageReactionRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SetMessageReactionRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, SetMessageReactionRequest> mapFromJson(dynamic json) {
    final map = <String, SetMessageReactionRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = SetMessageReactionRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of SetMessageReactionRequest-objects as value to a dart map
  static Map<String, List<SetMessageReactionRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<SetMessageReactionRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = SetMessageReactionRequest.listFromJson(
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
  };
}

enum SetMessageReactionRequestReactionEnum {
  like._(r'like'),
  love._(r'love'),
  laugh._(r'laugh'),
  surprised._(r'surprised'),
  sad._(r'sad'),
  angry._(r'angry'),
  thanks._(r'thanks'),
  ;

  /// Instantiate a new enum with the provided value.
  const SetMessageReactionRequestReactionEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [SetMessageReactionRequestReactionEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static SetMessageReactionRequestReactionEnum? fromJson(dynamic value) =>
      SetMessageReactionRequestReactionEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [SetMessageReactionRequestReactionEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<SetMessageReactionRequestReactionEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <SetMessageReactionRequestReactionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SetMessageReactionRequestReactionEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [SetMessageReactionRequestReactionEnum] to String,
/// and [decode] dynamic data back to [SetMessageReactionRequestReactionEnum].
class SetMessageReactionRequestReactionEnumTypeTransformer {
  factory SetMessageReactionRequestReactionEnumTypeTransformer() =>
      _instance ??=
          const SetMessageReactionRequestReactionEnumTypeTransformer._();

  const SetMessageReactionRequestReactionEnumTypeTransformer._();

  String encode(SetMessageReactionRequestReactionEnum data) => data._value;

  /// Returns the instance of [SetMessageReactionRequestReactionEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  SetMessageReactionRequestReactionEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is SetMessageReactionRequestReactionEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'like':
          return SetMessageReactionRequestReactionEnum.like;
        case r'love':
          return SetMessageReactionRequestReactionEnum.love;
        case r'laugh':
          return SetMessageReactionRequestReactionEnum.laugh;
        case r'surprised':
          return SetMessageReactionRequestReactionEnum.surprised;
        case r'sad':
          return SetMessageReactionRequestReactionEnum.sad;
        case r'angry':
          return SetMessageReactionRequestReactionEnum.angry;
        case r'thanks':
          return SetMessageReactionRequestReactionEnum.thanks;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static SetMessageReactionRequestReactionEnumTypeTransformer? _instance;
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

enum RelationshipState {
  none._(r'none'),
  outgoingPending._(r'outgoing_pending'),
  incomingPending._(r'incoming_pending'),
  friends._(r'friends'),
  blocked._(r'blocked'),
  ;

  /// Instantiate a new enum with the provided value.
  const RelationshipState._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [RelationshipState] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static RelationshipState? fromJson(dynamic value) =>
      RelationshipStateTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [RelationshipState]
  /// that were successfully decoded from the passed [JSON][json].
  static List<RelationshipState> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <RelationshipState>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RelationshipState.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [RelationshipState] to String,
/// and [decode] dynamic data back to [RelationshipState].
class RelationshipStateTypeTransformer {
  factory RelationshipStateTypeTransformer() =>
      _instance ??= const RelationshipStateTypeTransformer._();

  const RelationshipStateTypeTransformer._();

  /// Encodes this enum as a value suitable for JSON.
  String encode(RelationshipState data) => data._value;

  /// Returns the instance of [RelationshipState] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  RelationshipState? decode(dynamic data, {bool allowNull = true}) {
    if (data is RelationshipState) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'none':
          return RelationshipState.none;
        case r'outgoing_pending':
          return RelationshipState.outgoingPending;
        case r'incoming_pending':
          return RelationshipState.incomingPending;
        case r'friends':
          return RelationshipState.friends;
        case r'blocked':
          return RelationshipState.blocked;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static RelationshipStateTypeTransformer? _instance;
}

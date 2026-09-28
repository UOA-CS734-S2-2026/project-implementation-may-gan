//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ResolveMessageRequestRequest {
  /// Returns a new [ResolveMessageRequestRequest] instance.
  ResolveMessageRequestRequest({
    required this.decision,
  });

  final ResolveMessageRequestRequestDecisionEnum decision;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ResolveMessageRequestRequest && other.decision == decision;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (decision.hashCode);

  @override
  String toString() => 'ResolveMessageRequestRequest[decision=$decision]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'decision'] = this.decision;
    return json;
  }

  /// Clones this instance of [ResolveMessageRequestRequest] and returns a new one where some of the
  /// properties have changed.
  ResolveMessageRequestRequest copyWith({
    ResolveMessageRequestRequestDecisionEnum? decision,
  }) =>
      ResolveMessageRequestRequest(
        decision: decision ?? this.decision,
      );

  /// Returns a new [ResolveMessageRequestRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ResolveMessageRequestRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'decision'),
            'Required key "ResolveMessageRequestRequest[decision]" is missing from JSON.');
        assert(json[r'decision'] != null,
            'Required key "ResolveMessageRequestRequest[decision]" has a null value in JSON.');
        return true;
      }());

      return ResolveMessageRequestRequest(
        decision: ResolveMessageRequestRequestDecisionEnum.fromJson(
            json[r'decision'])!,
      );
    }
    return null;
  }

  static List<ResolveMessageRequestRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ResolveMessageRequestRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ResolveMessageRequestRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ResolveMessageRequestRequest> mapFromJson(dynamic json) {
    final map = <String, ResolveMessageRequestRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ResolveMessageRequestRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ResolveMessageRequestRequest-objects as value to a dart map
  static Map<String, List<ResolveMessageRequestRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ResolveMessageRequestRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ResolveMessageRequestRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'decision',
  };
}

enum ResolveMessageRequestRequestDecisionEnum {
  accept._(r'accept'),
  decline._(r'decline'),
  ;

  /// Instantiate a new enum with the provided value.
  const ResolveMessageRequestRequestDecisionEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [ResolveMessageRequestRequestDecisionEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static ResolveMessageRequestRequestDecisionEnum? fromJson(dynamic value) =>
      ResolveMessageRequestRequestDecisionEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [ResolveMessageRequestRequestDecisionEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<ResolveMessageRequestRequestDecisionEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ResolveMessageRequestRequestDecisionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ResolveMessageRequestRequestDecisionEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ResolveMessageRequestRequestDecisionEnum] to String,
/// and [decode] dynamic data back to [ResolveMessageRequestRequestDecisionEnum].
class ResolveMessageRequestRequestDecisionEnumTypeTransformer {
  factory ResolveMessageRequestRequestDecisionEnumTypeTransformer() =>
      _instance ??=
          const ResolveMessageRequestRequestDecisionEnumTypeTransformer._();

  const ResolveMessageRequestRequestDecisionEnumTypeTransformer._();

  String encode(ResolveMessageRequestRequestDecisionEnum data) => data._value;

  /// Returns the instance of [ResolveMessageRequestRequestDecisionEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ResolveMessageRequestRequestDecisionEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is ResolveMessageRequestRequestDecisionEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'accept':
          return ResolveMessageRequestRequestDecisionEnum.accept;
        case r'decline':
          return ResolveMessageRequestRequestDecisionEnum.decline;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static ResolveMessageRequestRequestDecisionEnumTypeTransformer? _instance;
}

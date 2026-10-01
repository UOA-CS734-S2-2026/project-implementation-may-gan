//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

/// Null when unset or when the bio is hidden.
enum Mbti {
  INTJ._(r'INTJ'),
  INTP._(r'INTP'),
  ENTJ._(r'ENTJ'),
  ENTP._(r'ENTP'),
  INFJ._(r'INFJ'),
  INFP._(r'INFP'),
  ENFJ._(r'ENFJ'),
  ENFP._(r'ENFP'),
  ISTJ._(r'ISTJ'),
  ISFJ._(r'ISFJ'),
  ESTJ._(r'ESTJ'),
  ESFJ._(r'ESFJ'),
  ISTP._(r'ISTP'),
  ISFP._(r'ISFP'),
  ESTP._(r'ESTP'),
  ESFP._(r'ESFP'),
  ;

  /// Instantiate a new enum with the provided value.
  const Mbti._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [Mbti] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static Mbti? fromJson(dynamic value) => MbtiTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [Mbti]
  /// that were successfully decoded from the passed [JSON][json].
  static List<Mbti> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <Mbti>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = Mbti.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [Mbti] to String,
/// and [decode] dynamic data back to [Mbti].
class MbtiTypeTransformer {
  factory MbtiTypeTransformer() => _instance ??= const MbtiTypeTransformer._();

  const MbtiTypeTransformer._();

  /// Encodes this enum as a value suitable for JSON.
  String encode(Mbti data) => data._value;

  /// Returns the instance of [Mbti] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  Mbti? decode(dynamic data, {bool allowNull = true}) {
    if (data is Mbti) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'INTJ':
          return Mbti.INTJ;
        case r'INTP':
          return Mbti.INTP;
        case r'ENTJ':
          return Mbti.ENTJ;
        case r'ENTP':
          return Mbti.ENTP;
        case r'INFJ':
          return Mbti.INFJ;
        case r'INFP':
          return Mbti.INFP;
        case r'ENFJ':
          return Mbti.ENFJ;
        case r'ENFP':
          return Mbti.ENFP;
        case r'ISTJ':
          return Mbti.ISTJ;
        case r'ISFJ':
          return Mbti.ISFJ;
        case r'ESTJ':
          return Mbti.ESTJ;
        case r'ESFJ':
          return Mbti.ESFJ;
        case r'ISTP':
          return Mbti.ISTP;
        case r'ISFP':
          return Mbti.ISFP;
        case r'ESTP':
          return Mbti.ESTP;
        case r'ESFP':
          return Mbti.ESFP;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static MbtiTypeTransformer? _instance;
}

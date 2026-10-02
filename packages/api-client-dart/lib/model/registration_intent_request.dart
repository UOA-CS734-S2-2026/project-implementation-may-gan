//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RegistrationIntentRequest {
  /// Returns a new [RegistrationIntentRequest] instance.
  RegistrationIntentRequest({
    required this.flow,
    required this.termsVersionId,
    required this.termsContentDigest,
    required this.acceptedTermsAndDeclaredAge16,
  });

  final RegistrationIntentRequestFlowEnum flow;

  final String termsVersionId;

  final String termsContentDigest;

  final bool acceptedTermsAndDeclaredAge16;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RegistrationIntentRequest &&
          other.flow == flow &&
          other.termsVersionId == termsVersionId &&
          other.termsContentDigest == termsContentDigest &&
          other.acceptedTermsAndDeclaredAge16 == acceptedTermsAndDeclaredAge16;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (flow.hashCode) +
      (termsVersionId.hashCode) +
      (termsContentDigest.hashCode) +
      (acceptedTermsAndDeclaredAge16.hashCode);

  @override
  String toString() =>
      'RegistrationIntentRequest[flow=$flow, termsVersionId=$termsVersionId, termsContentDigest=$termsContentDigest, acceptedTermsAndDeclaredAge16=$acceptedTermsAndDeclaredAge16]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'flow'] = this.flow;
    json[r'termsVersionId'] = this.termsVersionId;
    json[r'termsContentDigest'] = this.termsContentDigest;
    json[r'acceptedTermsAndDeclaredAge16'] = this.acceptedTermsAndDeclaredAge16;
    return json;
  }

  /// Clones this instance of [RegistrationIntentRequest] and returns a new one where some of the
  /// properties have changed.
  RegistrationIntentRequest copyWith({
    RegistrationIntentRequestFlowEnum? flow,
    String? termsVersionId,
    String? termsContentDigest,
    bool? acceptedTermsAndDeclaredAge16,
  }) =>
      RegistrationIntentRequest(
        flow: flow ?? this.flow,
        termsVersionId: termsVersionId ?? this.termsVersionId,
        termsContentDigest: termsContentDigest ?? this.termsContentDigest,
        acceptedTermsAndDeclaredAge16:
            acceptedTermsAndDeclaredAge16 ?? this.acceptedTermsAndDeclaredAge16,
      );

  /// Returns a new [RegistrationIntentRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static RegistrationIntentRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'flow'),
            'Required key "RegistrationIntentRequest[flow]" is missing from JSON.');
        assert(json[r'flow'] != null,
            'Required key "RegistrationIntentRequest[flow]" has a null value in JSON.');
        assert(json.containsKey(r'termsVersionId'),
            'Required key "RegistrationIntentRequest[termsVersionId]" is missing from JSON.');
        assert(json[r'termsVersionId'] != null,
            'Required key "RegistrationIntentRequest[termsVersionId]" has a null value in JSON.');
        assert(json.containsKey(r'termsContentDigest'),
            'Required key "RegistrationIntentRequest[termsContentDigest]" is missing from JSON.');
        assert(json[r'termsContentDigest'] != null,
            'Required key "RegistrationIntentRequest[termsContentDigest]" has a null value in JSON.');
        assert(json.containsKey(r'acceptedTermsAndDeclaredAge16'),
            'Required key "RegistrationIntentRequest[acceptedTermsAndDeclaredAge16]" is missing from JSON.');
        assert(json[r'acceptedTermsAndDeclaredAge16'] != null,
            'Required key "RegistrationIntentRequest[acceptedTermsAndDeclaredAge16]" has a null value in JSON.');
        return true;
      }());

      return RegistrationIntentRequest(
        flow: RegistrationIntentRequestFlowEnum.fromJson(json[r'flow'])!,
        termsVersionId: mapValueOfType<String>(json, r'termsVersionId')!,
        termsContentDigest:
            mapValueOfType<String>(json, r'termsContentDigest')!,
        acceptedTermsAndDeclaredAge16:
            mapValueOfType<bool>(json, r'acceptedTermsAndDeclaredAge16')!,
      );
    }
    return null;
  }

  static List<RegistrationIntentRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <RegistrationIntentRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RegistrationIntentRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, RegistrationIntentRequest> mapFromJson(dynamic json) {
    final map = <String, RegistrationIntentRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = RegistrationIntentRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of RegistrationIntentRequest-objects as value to a dart map
  static Map<String, List<RegistrationIntentRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<RegistrationIntentRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = RegistrationIntentRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'flow',
    'termsVersionId',
    'termsContentDigest',
    'acceptedTermsAndDeclaredAge16',
  };
}

enum RegistrationIntentRequestFlowEnum {
  email._(r'email'),
  googleNative._(r'google_native'),
  googleBrowser._(r'google_browser'),
  ;

  /// Instantiate a new enum with the provided value.
  const RegistrationIntentRequestFlowEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [RegistrationIntentRequestFlowEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static RegistrationIntentRequestFlowEnum? fromJson(dynamic value) =>
      RegistrationIntentRequestFlowEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [RegistrationIntentRequestFlowEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<RegistrationIntentRequestFlowEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <RegistrationIntentRequestFlowEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = RegistrationIntentRequestFlowEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [RegistrationIntentRequestFlowEnum] to String,
/// and [decode] dynamic data back to [RegistrationIntentRequestFlowEnum].
class RegistrationIntentRequestFlowEnumTypeTransformer {
  factory RegistrationIntentRequestFlowEnumTypeTransformer() =>
      _instance ??= const RegistrationIntentRequestFlowEnumTypeTransformer._();

  const RegistrationIntentRequestFlowEnumTypeTransformer._();

  String encode(RegistrationIntentRequestFlowEnum data) => data._value;

  /// Returns the instance of [RegistrationIntentRequestFlowEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  RegistrationIntentRequestFlowEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is RegistrationIntentRequestFlowEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'email':
          return RegistrationIntentRequestFlowEnum.email;
        case r'google_native':
          return RegistrationIntentRequestFlowEnum.googleNative;
        case r'google_browser':
          return RegistrationIntentRequestFlowEnum.googleBrowser;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static RegistrationIntentRequestFlowEnumTypeTransformer? _instance;
}

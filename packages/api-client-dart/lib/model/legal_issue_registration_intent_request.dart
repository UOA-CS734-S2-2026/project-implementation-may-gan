//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalIssueRegistrationIntentRequest {
  /// Returns a new [LegalIssueRegistrationIntentRequest] instance.
  LegalIssueRegistrationIntentRequest({
    required this.flow,
    required this.acceptTerms,
    required this.declareAge16OrOlder,
  });

  final LegalIssueRegistrationIntentRequestFlowEnum flow;

  final bool acceptTerms;

  final bool declareAge16OrOlder;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LegalIssueRegistrationIntentRequest &&
          other.flow == flow &&
          other.acceptTerms == acceptTerms &&
          other.declareAge16OrOlder == declareAge16OrOlder;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (flow.hashCode) + (acceptTerms.hashCode) + (declareAge16OrOlder.hashCode);

  @override
  String toString() =>
      'LegalIssueRegistrationIntentRequest[flow=$flow, acceptTerms=$acceptTerms, declareAge16OrOlder=$declareAge16OrOlder]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'flow'] = this.flow;
    json[r'acceptTerms'] = this.acceptTerms;
    json[r'declareAge16OrOlder'] = this.declareAge16OrOlder;
    return json;
  }

  /// Clones this instance of [LegalIssueRegistrationIntentRequest] and returns a new one where some of the
  /// properties have changed.
  LegalIssueRegistrationIntentRequest copyWith({
    LegalIssueRegistrationIntentRequestFlowEnum? flow,
    bool? acceptTerms,
    bool? declareAge16OrOlder,
  }) =>
      LegalIssueRegistrationIntentRequest(
        flow: flow ?? this.flow,
        acceptTerms: acceptTerms ?? this.acceptTerms,
        declareAge16OrOlder: declareAge16OrOlder ?? this.declareAge16OrOlder,
      );

  /// Returns a new [LegalIssueRegistrationIntentRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static LegalIssueRegistrationIntentRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'flow'),
            'Required key "LegalIssueRegistrationIntentRequest[flow]" is missing from JSON.');
        assert(json[r'flow'] != null,
            'Required key "LegalIssueRegistrationIntentRequest[flow]" has a null value in JSON.');
        assert(json.containsKey(r'acceptTerms'),
            'Required key "LegalIssueRegistrationIntentRequest[acceptTerms]" is missing from JSON.');
        assert(json[r'acceptTerms'] != null,
            'Required key "LegalIssueRegistrationIntentRequest[acceptTerms]" has a null value in JSON.');
        assert(json.containsKey(r'declareAge16OrOlder'),
            'Required key "LegalIssueRegistrationIntentRequest[declareAge16OrOlder]" is missing from JSON.');
        assert(json[r'declareAge16OrOlder'] != null,
            'Required key "LegalIssueRegistrationIntentRequest[declareAge16OrOlder]" has a null value in JSON.');
        return true;
      }());

      return LegalIssueRegistrationIntentRequest(
        flow: LegalIssueRegistrationIntentRequestFlowEnum.fromJson(
            json[r'flow'])!,
        acceptTerms: mapValueOfType<bool>(json, r'acceptTerms')!,
        declareAge16OrOlder:
            mapValueOfType<bool>(json, r'declareAge16OrOlder')!,
      );
    }
    return null;
  }

  static List<LegalIssueRegistrationIntentRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalIssueRegistrationIntentRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LegalIssueRegistrationIntentRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, LegalIssueRegistrationIntentRequest> mapFromJson(
      dynamic json) {
    final map = <String, LegalIssueRegistrationIntentRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = LegalIssueRegistrationIntentRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of LegalIssueRegistrationIntentRequest-objects as value to a dart map
  static Map<String, List<LegalIssueRegistrationIntentRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<LegalIssueRegistrationIntentRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = LegalIssueRegistrationIntentRequest.listFromJson(
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
    'acceptTerms',
    'declareAge16OrOlder',
  };
}

enum LegalIssueRegistrationIntentRequestFlowEnum {
  email._(r'email'),
  googleNative._(r'google_native'),
  googleBrowser._(r'google_browser'),
  ;

  /// Instantiate a new enum with the provided value.
  const LegalIssueRegistrationIntentRequestFlowEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [LegalIssueRegistrationIntentRequestFlowEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static LegalIssueRegistrationIntentRequestFlowEnum? fromJson(dynamic value) =>
      LegalIssueRegistrationIntentRequestFlowEnumTypeTransformer()
          .decode(value);

  /// Returns a [List] containing instances of [LegalIssueRegistrationIntentRequestFlowEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<LegalIssueRegistrationIntentRequestFlowEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <LegalIssueRegistrationIntentRequestFlowEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = LegalIssueRegistrationIntentRequestFlowEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [LegalIssueRegistrationIntentRequestFlowEnum] to String,
/// and [decode] dynamic data back to [LegalIssueRegistrationIntentRequestFlowEnum].
class LegalIssueRegistrationIntentRequestFlowEnumTypeTransformer {
  factory LegalIssueRegistrationIntentRequestFlowEnumTypeTransformer() =>
      _instance ??=
          const LegalIssueRegistrationIntentRequestFlowEnumTypeTransformer._();

  const LegalIssueRegistrationIntentRequestFlowEnumTypeTransformer._();

  String encode(LegalIssueRegistrationIntentRequestFlowEnum data) =>
      data._value;

  /// Returns the instance of [LegalIssueRegistrationIntentRequestFlowEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  LegalIssueRegistrationIntentRequestFlowEnum? decode(dynamic data,
      {bool allowNull = true}) {
    if (data is LegalIssueRegistrationIntentRequestFlowEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'email':
          return LegalIssueRegistrationIntentRequestFlowEnum.email;
        case r'google_native':
          return LegalIssueRegistrationIntentRequestFlowEnum.googleNative;
        case r'google_browser':
          return LegalIssueRegistrationIntentRequestFlowEnum.googleBrowser;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static LegalIssueRegistrationIntentRequestFlowEnumTypeTransformer? _instance;
}

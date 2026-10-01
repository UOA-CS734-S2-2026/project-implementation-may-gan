//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountGoogleProofBegin200Response {
  /// Returns a new [AccountGoogleProofBegin200Response] instance.
  AccountGoogleProofBegin200Response({
    required this.authorizationUrl,
  });

  final String authorizationUrl;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountGoogleProofBegin200Response &&
          other.authorizationUrl == authorizationUrl;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (authorizationUrl.hashCode);

  @override
  String toString() =>
      'AccountGoogleProofBegin200Response[authorizationUrl=$authorizationUrl]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'authorizationUrl'] = this.authorizationUrl;
    return json;
  }

  /// Clones this instance of [AccountGoogleProofBegin200Response] and returns a new one where some of the
  /// properties have changed.
  AccountGoogleProofBegin200Response copyWith({
    String? authorizationUrl,
  }) =>
      AccountGoogleProofBegin200Response(
        authorizationUrl: authorizationUrl ?? this.authorizationUrl,
      );

  /// Returns a new [AccountGoogleProofBegin200Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountGoogleProofBegin200Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'authorizationUrl'),
            'Required key "AccountGoogleProofBegin200Response[authorizationUrl]" is missing from JSON.');
        assert(json[r'authorizationUrl'] != null,
            'Required key "AccountGoogleProofBegin200Response[authorizationUrl]" has a null value in JSON.');
        return true;
      }());

      return AccountGoogleProofBegin200Response(
        authorizationUrl: mapValueOfType<String>(json, r'authorizationUrl')!,
      );
    }
    return null;
  }

  static List<AccountGoogleProofBegin200Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountGoogleProofBegin200Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountGoogleProofBegin200Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountGoogleProofBegin200Response> mapFromJson(
      dynamic json) {
    final map = <String, AccountGoogleProofBegin200Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountGoogleProofBegin200Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountGoogleProofBegin200Response-objects as value to a dart map
  static Map<String, List<AccountGoogleProofBegin200Response>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountGoogleProofBegin200Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountGoogleProofBegin200Response.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'authorizationUrl',
  };
}

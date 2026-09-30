//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountGoogleProofComplete200Response {
  /// Returns a new [AccountGoogleProofComplete200Response] instance.
  AccountGoogleProofComplete200Response({
    required this.grant,
    required this.expiresAt,
  });

  final String grant;

  final DateTime expiresAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountGoogleProofComplete200Response &&
          other.grant == grant &&
          other.expiresAt == expiresAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (grant.hashCode) + (expiresAt.hashCode);

  @override
  String toString() =>
      'AccountGoogleProofComplete200Response[grant=$grant, expiresAt=$expiresAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'grant'] = this.grant;
    json[r'expiresAt'] = this.expiresAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [AccountGoogleProofComplete200Response] and returns a new one where some of the
  /// properties have changed.
  AccountGoogleProofComplete200Response copyWith({
    String? grant,
    DateTime? expiresAt,
  }) =>
      AccountGoogleProofComplete200Response(
        grant: grant ?? this.grant,
        expiresAt: expiresAt ?? this.expiresAt,
      );

  /// Returns a new [AccountGoogleProofComplete200Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountGoogleProofComplete200Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'grant'),
            'Required key "AccountGoogleProofComplete200Response[grant]" is missing from JSON.');
        assert(json[r'grant'] != null,
            'Required key "AccountGoogleProofComplete200Response[grant]" has a null value in JSON.');
        assert(json.containsKey(r'expiresAt'),
            'Required key "AccountGoogleProofComplete200Response[expiresAt]" is missing from JSON.');
        assert(json[r'expiresAt'] != null,
            'Required key "AccountGoogleProofComplete200Response[expiresAt]" has a null value in JSON.');
        return true;
      }());

      return AccountGoogleProofComplete200Response(
        grant: mapValueOfType<String>(json, r'grant')!,
        expiresAt: mapDateTime(json, r'expiresAt', r'')!,
      );
    }
    return null;
  }

  static List<AccountGoogleProofComplete200Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountGoogleProofComplete200Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountGoogleProofComplete200Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountGoogleProofComplete200Response> mapFromJson(
      dynamic json) {
    final map = <String, AccountGoogleProofComplete200Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value =
            AccountGoogleProofComplete200Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountGoogleProofComplete200Response-objects as value to a dart map
  static Map<String, List<AccountGoogleProofComplete200Response>>
      mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountGoogleProofComplete200Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountGoogleProofComplete200Response.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'grant',
    'expiresAt',
  };
}

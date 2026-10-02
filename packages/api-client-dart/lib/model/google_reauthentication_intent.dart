//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class GoogleReauthenticationIntent {
  /// Returns a new [GoogleReauthenticationIntent] instance.
  GoogleReauthenticationIntent({
    required this.authorizationUrl,
    required this.expiresAt,
  });

  final String authorizationUrl;

  final DateTime expiresAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GoogleReauthenticationIntent &&
          other.authorizationUrl == authorizationUrl &&
          other.expiresAt == expiresAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (authorizationUrl.hashCode) + (expiresAt.hashCode);

  @override
  String toString() =>
      'GoogleReauthenticationIntent[authorizationUrl=$authorizationUrl, expiresAt=$expiresAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'authorizationUrl'] = this.authorizationUrl;
    json[r'expiresAt'] = this.expiresAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [GoogleReauthenticationIntent] and returns a new one where some of the
  /// properties have changed.
  GoogleReauthenticationIntent copyWith({
    String? authorizationUrl,
    DateTime? expiresAt,
  }) =>
      GoogleReauthenticationIntent(
        authorizationUrl: authorizationUrl ?? this.authorizationUrl,
        expiresAt: expiresAt ?? this.expiresAt,
      );

  /// Returns a new [GoogleReauthenticationIntent] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static GoogleReauthenticationIntent? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'authorizationUrl'),
            'Required key "GoogleReauthenticationIntent[authorizationUrl]" is missing from JSON.');
        assert(json[r'authorizationUrl'] != null,
            'Required key "GoogleReauthenticationIntent[authorizationUrl]" has a null value in JSON.');
        assert(json.containsKey(r'expiresAt'),
            'Required key "GoogleReauthenticationIntent[expiresAt]" is missing from JSON.');
        assert(json[r'expiresAt'] != null,
            'Required key "GoogleReauthenticationIntent[expiresAt]" has a null value in JSON.');
        return true;
      }());

      return GoogleReauthenticationIntent(
        authorizationUrl: mapValueOfType<String>(json, r'authorizationUrl')!,
        expiresAt: mapDateTime(json, r'expiresAt', r'')!,
      );
    }
    return null;
  }

  static List<GoogleReauthenticationIntent> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <GoogleReauthenticationIntent>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = GoogleReauthenticationIntent.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, GoogleReauthenticationIntent> mapFromJson(dynamic json) {
    final map = <String, GoogleReauthenticationIntent>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = GoogleReauthenticationIntent.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of GoogleReauthenticationIntent-objects as value to a dart map
  static Map<String, List<GoogleReauthenticationIntent>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<GoogleReauthenticationIntent>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = GoogleReauthenticationIntent.listFromJson(
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
    'expiresAt',
  };
}

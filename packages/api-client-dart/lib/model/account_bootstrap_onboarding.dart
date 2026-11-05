//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountBootstrapOnboarding {
  /// Returns a new [AccountBootstrapOnboarding] instance.
  AccountBootstrapOnboarding({
    required this.legalAcceptanceRequired,
    required this.usernameSetupRequired,
  });

  final bool legalAcceptanceRequired;

  final bool usernameSetupRequired;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountBootstrapOnboarding &&
          other.legalAcceptanceRequired == legalAcceptanceRequired &&
          other.usernameSetupRequired == usernameSetupRequired;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (legalAcceptanceRequired.hashCode) + (usernameSetupRequired.hashCode);

  @override
  String toString() =>
      'AccountBootstrapOnboarding[legalAcceptanceRequired=$legalAcceptanceRequired, usernameSetupRequired=$usernameSetupRequired]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'legalAcceptanceRequired'] = this.legalAcceptanceRequired;
    json[r'usernameSetupRequired'] = this.usernameSetupRequired;
    return json;
  }

  /// Clones this instance of [AccountBootstrapOnboarding] and returns a new one where some of the
  /// properties have changed.
  AccountBootstrapOnboarding copyWith({
    bool? legalAcceptanceRequired,
    bool? usernameSetupRequired,
  }) =>
      AccountBootstrapOnboarding(
        legalAcceptanceRequired:
            legalAcceptanceRequired ?? this.legalAcceptanceRequired,
        usernameSetupRequired:
            usernameSetupRequired ?? this.usernameSetupRequired,
      );

  /// Returns a new [AccountBootstrapOnboarding] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountBootstrapOnboarding? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'legalAcceptanceRequired'),
            'Required key "AccountBootstrapOnboarding[legalAcceptanceRequired]" is missing from JSON.');
        assert(json[r'legalAcceptanceRequired'] != null,
            'Required key "AccountBootstrapOnboarding[legalAcceptanceRequired]" has a null value in JSON.');
        assert(json.containsKey(r'usernameSetupRequired'),
            'Required key "AccountBootstrapOnboarding[usernameSetupRequired]" is missing from JSON.');
        assert(json[r'usernameSetupRequired'] != null,
            'Required key "AccountBootstrapOnboarding[usernameSetupRequired]" has a null value in JSON.');
        return true;
      }());

      return AccountBootstrapOnboarding(
        legalAcceptanceRequired:
            mapValueOfType<bool>(json, r'legalAcceptanceRequired')!,
        usernameSetupRequired:
            mapValueOfType<bool>(json, r'usernameSetupRequired')!,
      );
    }
    return null;
  }

  static List<AccountBootstrapOnboarding> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountBootstrapOnboarding>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountBootstrapOnboarding.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountBootstrapOnboarding> mapFromJson(dynamic json) {
    final map = <String, AccountBootstrapOnboarding>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountBootstrapOnboarding.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountBootstrapOnboarding-objects as value to a dart map
  static Map<String, List<AccountBootstrapOnboarding>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountBootstrapOnboarding>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountBootstrapOnboarding.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'legalAcceptanceRequired',
    'usernameSetupRequired',
  };
}

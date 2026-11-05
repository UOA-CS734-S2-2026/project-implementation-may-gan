//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountBootstrap {
  /// Returns a new [AccountBootstrap] instance.
  AccountBootstrap({
    required this.restriction,
    this.allowed = const [],
    required this.onboarding,
  });

  final String restriction;

  final List<String> allowed;

  final AccountBootstrapOnboarding onboarding;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountBootstrap &&
          other.restriction == restriction &&
          _deepEquality.equals(other.allowed, allowed) &&
          other.onboarding == onboarding;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (restriction.hashCode) + (allowed.hashCode) + (onboarding.hashCode);

  @override
  String toString() =>
      'AccountBootstrap[restriction=$restriction, allowed=$allowed, onboarding=$onboarding]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'restriction'] = this.restriction;
    json[r'allowed'] = this.allowed;
    json[r'onboarding'] = this.onboarding;
    return json;
  }

  /// Clones this instance of [AccountBootstrap] and returns a new one where some of the
  /// properties have changed.
  AccountBootstrap copyWith({
    String? restriction,
    List<String>? allowed,
    AccountBootstrapOnboarding? onboarding,
  }) =>
      AccountBootstrap(
        restriction: restriction ?? this.restriction,
        allowed: allowed ?? this.allowed,
        onboarding: onboarding ?? this.onboarding,
      );

  /// Returns a new [AccountBootstrap] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountBootstrap? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'restriction'),
            'Required key "AccountBootstrap[restriction]" is missing from JSON.');
        assert(json[r'restriction'] != null,
            'Required key "AccountBootstrap[restriction]" has a null value in JSON.');
        assert(json.containsKey(r'allowed'),
            'Required key "AccountBootstrap[allowed]" is missing from JSON.');
        assert(json[r'allowed'] != null,
            'Required key "AccountBootstrap[allowed]" has a null value in JSON.');
        assert(json.containsKey(r'onboarding'),
            'Required key "AccountBootstrap[onboarding]" is missing from JSON.');
        assert(json[r'onboarding'] != null,
            'Required key "AccountBootstrap[onboarding]" has a null value in JSON.');
        return true;
      }());

      return AccountBootstrap(
        restriction: mapValueOfType<String>(json, r'restriction')!,
        allowed: json[r'allowed'] is Iterable
            ? (json[r'allowed'] as Iterable)
                .cast<String>()
                .toList(growable: false)
            : const [],
        onboarding: AccountBootstrapOnboarding.fromJson(json[r'onboarding'])!,
      );
    }
    return null;
  }

  static List<AccountBootstrap> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountBootstrap>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountBootstrap.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountBootstrap> mapFromJson(dynamic json) {
    final map = <String, AccountBootstrap>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountBootstrap.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountBootstrap-objects as value to a dart map
  static Map<String, List<AccountBootstrap>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountBootstrap>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountBootstrap.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'restriction',
    'allowed',
    'onboarding',
  };
}

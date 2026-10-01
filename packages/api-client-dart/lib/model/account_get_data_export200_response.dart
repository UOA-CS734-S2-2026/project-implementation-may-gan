//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountGetDataExport200Response {
  /// Returns a new [AccountGetDataExport200Response] instance.
  AccountGetDataExport200Response({
    required this.export_,
  });

  final AccountGetDataExport200ResponseExport export_;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AccountGetDataExport200Response && other.export_ == export_;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (export_.hashCode);

  @override
  String toString() => 'AccountGetDataExport200Response[export_=$export_]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'export'] = this.export_;
    return json;
  }

  /// Clones this instance of [AccountGetDataExport200Response] and returns a new one where some of the
  /// properties have changed.
  AccountGetDataExport200Response copyWith({
    AccountGetDataExport200ResponseExport? export_,
  }) =>
      AccountGetDataExport200Response(
        export_: export_ ?? this.export_,
      );

  /// Returns a new [AccountGetDataExport200Response] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AccountGetDataExport200Response? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'export'),
            'Required key "AccountGetDataExport200Response[export]" is missing from JSON.');
        assert(json[r'export'] != null,
            'Required key "AccountGetDataExport200Response[export]" has a null value in JSON.');
        return true;
      }());

      return AccountGetDataExport200Response(
        export_:
            AccountGetDataExport200ResponseExport.fromJson(json[r'export'])!,
      );
    }
    return null;
  }

  static List<AccountGetDataExport200Response> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <AccountGetDataExport200Response>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AccountGetDataExport200Response.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AccountGetDataExport200Response> mapFromJson(
      dynamic json) {
    final map = <String, AccountGetDataExport200Response>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AccountGetDataExport200Response.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AccountGetDataExport200Response-objects as value to a dart map
  static Map<String, List<AccountGetDataExport200Response>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<AccountGetDataExport200Response>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AccountGetDataExport200Response.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'export',
  };
}

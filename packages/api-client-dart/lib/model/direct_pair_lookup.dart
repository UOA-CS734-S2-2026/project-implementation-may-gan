//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class DirectPairLookup {
  /// Returns a new [DirectPairLookup] instance.
  DirectPairLookup({
    required this.conversationId,
  });

  final String conversationId;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DirectPairLookup && other.conversationId == conversationId;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (conversationId.hashCode);

  @override
  String toString() => 'DirectPairLookup[conversationId=$conversationId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'conversationId'] = this.conversationId;
    return json;
  }

  /// Clones this instance of [DirectPairLookup] and returns a new one where some of the
  /// properties have changed.
  DirectPairLookup copyWith({
    String? conversationId,
  }) =>
      DirectPairLookup(
        conversationId: conversationId ?? this.conversationId,
      );

  /// Returns a new [DirectPairLookup] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static DirectPairLookup? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'conversationId'),
            'Required key "DirectPairLookup[conversationId]" is missing from JSON.');
        assert(json[r'conversationId'] != null,
            'Required key "DirectPairLookup[conversationId]" has a null value in JSON.');
        return true;
      }());

      return DirectPairLookup(
        conversationId: mapValueOfType<String>(json, r'conversationId')!,
      );
    }
    return null;
  }

  static List<DirectPairLookup> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <DirectPairLookup>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = DirectPairLookup.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, DirectPairLookup> mapFromJson(dynamic json) {
    final map = <String, DirectPairLookup>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = DirectPairLookup.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of DirectPairLookup-objects as value to a dart map
  static Map<String, List<DirectPairLookup>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<DirectPairLookup>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = DirectPairLookup.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'conversationId',
  };
}

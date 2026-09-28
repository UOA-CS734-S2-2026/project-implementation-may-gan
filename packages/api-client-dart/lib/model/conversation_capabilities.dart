//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ConversationCapabilities {
  /// Returns a new [ConversationCapabilities] instance.
  ConversationCapabilities({
    required this.canSend,
    required this.canResolveRequest,
  });

  final bool canSend;

  final bool canResolveRequest;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ConversationCapabilities &&
          other.canSend == canSend &&
          other.canResolveRequest == canResolveRequest;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (canSend.hashCode) + (canResolveRequest.hashCode);

  @override
  String toString() =>
      'ConversationCapabilities[canSend=$canSend, canResolveRequest=$canResolveRequest]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'canSend'] = this.canSend;
    json[r'canResolveRequest'] = this.canResolveRequest;
    return json;
  }

  /// Clones this instance of [ConversationCapabilities] and returns a new one where some of the
  /// properties have changed.
  ConversationCapabilities copyWith({
    bool? canSend,
    bool? canResolveRequest,
  }) =>
      ConversationCapabilities(
        canSend: canSend ?? this.canSend,
        canResolveRequest: canResolveRequest ?? this.canResolveRequest,
      );

  /// Returns a new [ConversationCapabilities] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ConversationCapabilities? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'canSend'),
            'Required key "ConversationCapabilities[canSend]" is missing from JSON.');
        assert(json[r'canSend'] != null,
            'Required key "ConversationCapabilities[canSend]" has a null value in JSON.');
        assert(json.containsKey(r'canResolveRequest'),
            'Required key "ConversationCapabilities[canResolveRequest]" is missing from JSON.');
        assert(json[r'canResolveRequest'] != null,
            'Required key "ConversationCapabilities[canResolveRequest]" has a null value in JSON.');
        return true;
      }());

      return ConversationCapabilities(
        canSend: mapValueOfType<bool>(json, r'canSend')!,
        canResolveRequest: mapValueOfType<bool>(json, r'canResolveRequest')!,
      );
    }
    return null;
  }

  static List<ConversationCapabilities> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ConversationCapabilities>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ConversationCapabilities.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ConversationCapabilities> mapFromJson(dynamic json) {
    final map = <String, ConversationCapabilities>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ConversationCapabilities.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ConversationCapabilities-objects as value to a dart map
  static Map<String, List<ConversationCapabilities>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ConversationCapabilities>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ConversationCapabilities.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'canSend',
    'canResolveRequest',
  };
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MessageCreationRateLimitError {
  /// Returns a new [MessageCreationRateLimitError] instance.
  MessageCreationRateLimitError({
    required this.error,
  });

  final DirectMessageSendQuotaErrorError error;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MessageCreationRateLimitError && other.error == error;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (error.hashCode);

  @override
  String toString() => 'MessageCreationRateLimitError[error=$error]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'error'] = this.error;
    return json;
  }

  /// Clones this instance of [MessageCreationRateLimitError] and returns a new one where some of the
  /// properties have changed.
  MessageCreationRateLimitError copyWith({
    DirectMessageSendQuotaErrorError? error,
  }) =>
      MessageCreationRateLimitError(
        error: error ?? this.error,
      );

  /// Returns a new [MessageCreationRateLimitError] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MessageCreationRateLimitError? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'error'),
            'Required key "MessageCreationRateLimitError[error]" is missing from JSON.');
        assert(json[r'error'] != null,
            'Required key "MessageCreationRateLimitError[error]" has a null value in JSON.');
        return true;
      }());

      return MessageCreationRateLimitError(
        error: DirectMessageSendQuotaErrorError.fromJson(json[r'error'])!,
      );
    }
    return null;
  }

  static List<MessageCreationRateLimitError> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <MessageCreationRateLimitError>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MessageCreationRateLimitError.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MessageCreationRateLimitError> mapFromJson(dynamic json) {
    final map = <String, MessageCreationRateLimitError>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MessageCreationRateLimitError.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MessageCreationRateLimitError-objects as value to a dart map
  static Map<String, List<MessageCreationRateLimitError>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<MessageCreationRateLimitError>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MessageCreationRateLimitError.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'error',
  };
}

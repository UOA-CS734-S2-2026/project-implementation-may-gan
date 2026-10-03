//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateFutureSelfNoteRequest {
  /// Returns a new [CreateFutureSelfNoteRequest] instance.
  CreateFutureSelfNoteRequest({
    required this.body,
    required this.deliverOn,
  });

  /// The note text, trimmed, 1 to 1,000 characters. It is never readable before its delivery date.
  final String body;

  /// The Auckland calendar date the note is delivered on. When creating or rescheduling it must be from tomorrow (Auckland, decided by the server) up to 10 years after today.
  final String deliverOn;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CreateFutureSelfNoteRequest &&
          other.body == body &&
          other.deliverOn == deliverOn;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (body.hashCode) + (deliverOn.hashCode);

  @override
  String toString() =>
      'CreateFutureSelfNoteRequest[body=$body, deliverOn=$deliverOn]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'body'] = this.body;
    json[r'deliverOn'] = _dateFormatter.format(this.deliverOn);
    return json;
  }

  /// Clones this instance of [CreateFutureSelfNoteRequest] and returns a new one where some of the
  /// properties have changed.
  CreateFutureSelfNoteRequest copyWith({
    String? body,
    String? deliverOn,
  }) =>
      CreateFutureSelfNoteRequest(
        body: body ?? this.body,
        deliverOn: deliverOn ?? this.deliverOn,
      );

  /// Returns a new [CreateFutureSelfNoteRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateFutureSelfNoteRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'body'),
            'Required key "CreateFutureSelfNoteRequest[body]" is missing from JSON.');
        assert(json[r'body'] != null,
            'Required key "CreateFutureSelfNoteRequest[body]" has a null value in JSON.');
        assert(json.containsKey(r'deliverOn'),
            'Required key "CreateFutureSelfNoteRequest[deliverOn]" is missing from JSON.');
        assert(json[r'deliverOn'] != null,
            'Required key "CreateFutureSelfNoteRequest[deliverOn]" has a null value in JSON.');
        return true;
      }());

      return CreateFutureSelfNoteRequest(
        body: mapValueOfType<String>(json, r'body')!,
        deliverOn: mapDateTime(json, r'deliverOn', r'')!,
      );
    }
    return null;
  }

  static List<CreateFutureSelfNoteRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <CreateFutureSelfNoteRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreateFutureSelfNoteRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateFutureSelfNoteRequest> mapFromJson(dynamic json) {
    final map = <String, CreateFutureSelfNoteRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateFutureSelfNoteRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateFutureSelfNoteRequest-objects as value to a dart map
  static Map<String, List<CreateFutureSelfNoteRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<CreateFutureSelfNoteRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreateFutureSelfNoteRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'body',
    'deliverOn',
  };
}

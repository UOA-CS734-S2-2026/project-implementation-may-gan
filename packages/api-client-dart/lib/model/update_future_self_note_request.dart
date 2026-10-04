//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class UpdateFutureSelfNoteRequest {
  /// Returns a new [UpdateFutureSelfNoteRequest] instance.
  UpdateFutureSelfNoteRequest({
    this.body,
    this.deliverOn,
  });

  /// The note text, trimmed, 1 to 1,000 characters. It is never readable before its delivery date.
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? body;

  /// The Auckland calendar date the note is delivered on. When creating or rescheduling it must be from tomorrow (Auckland, decided by the server) up to 10 years after today.
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? deliverOn;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UpdateFutureSelfNoteRequest &&
          other.body == body &&
          other.deliverOn == deliverOn;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (body == null ? 0 : body!.hashCode) +
      (deliverOn == null ? 0 : deliverOn!.hashCode);

  @override
  String toString() =>
      'UpdateFutureSelfNoteRequest[body=$body, deliverOn=$deliverOn]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.body != null) {
      json[r'body'] = this.body;
    } else {
      json[r'body'] = null;
    }
    if (this.deliverOn != null) {
      json[r'deliverOn'] = this.deliverOn;
    } else {
      json[r'deliverOn'] = null;
    }
    return json;
  }

  /// Clones this instance of [UpdateFutureSelfNoteRequest] and returns a new one where some of the
  /// properties have changed.
  UpdateFutureSelfNoteRequest copyWith({
    String? body,
    String? deliverOn,
  }) =>
      UpdateFutureSelfNoteRequest(
        body: body ?? this.body,
        deliverOn: deliverOn ?? this.deliverOn,
      );

  /// Returns a new [UpdateFutureSelfNoteRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static UpdateFutureSelfNoteRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        return true;
      }());

      return UpdateFutureSelfNoteRequest(
        body: mapValueOfType<String>(json, r'body'),
        deliverOn: mapValueOfType<String>(json, r'deliverOn'),
      );
    }
    return null;
  }

  static List<UpdateFutureSelfNoteRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <UpdateFutureSelfNoteRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = UpdateFutureSelfNoteRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, UpdateFutureSelfNoteRequest> mapFromJson(dynamic json) {
    final map = <String, UpdateFutureSelfNoteRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = UpdateFutureSelfNoteRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of UpdateFutureSelfNoteRequest-objects as value to a dart map
  static Map<String, List<UpdateFutureSelfNoteRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<UpdateFutureSelfNoteRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = UpdateFutureSelfNoteRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{};
}

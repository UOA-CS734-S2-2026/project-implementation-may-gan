//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FutureSelfNote {
  /// Returns a new [FutureSelfNote] instance.
  FutureSelfNote({
    required this.id,
    required this.deliverOn,
    required this.status,
    required this.deliveredAt,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;

  final String deliverOn;

  final FutureSelfNoteStatus status;

  final DateTime deliveredAt;

  final DateTime createdAt;

  final DateTime updatedAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is FutureSelfNote &&
          other.id == id &&
          other.deliverOn == deliverOn &&
          other.status == status &&
          other.deliveredAt == deliveredAt &&
          other.createdAt == createdAt &&
          other.updatedAt == updatedAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (deliverOn.hashCode) +
      (status.hashCode) +
      (deliveredAt.hashCode) +
      (createdAt.hashCode) +
      (updatedAt.hashCode);

  @override
  String toString() =>
      'FutureSelfNote[id=$id, deliverOn=$deliverOn, status=$status, deliveredAt=$deliveredAt, createdAt=$createdAt, updatedAt=$updatedAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'deliverOn'] = _dateFormatter.format(this.deliverOn);
    json[r'status'] = this.status;
    json[r'deliveredAt'] = this.deliveredAt.toUtc().toIso8601String();
    json[r'createdAt'] = this.createdAt.toUtc().toIso8601String();
    json[r'updatedAt'] = this.updatedAt.toUtc().toIso8601String();
    return json;
  }

  /// Clones this instance of [FutureSelfNote] and returns a new one where some of the
  /// properties have changed.
  FutureSelfNote copyWith({
    String? id,
    String? deliverOn,
    FutureSelfNoteStatus? status,
    DateTime? deliveredAt,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) =>
      FutureSelfNote(
        id: id ?? this.id,
        deliverOn: deliverOn ?? this.deliverOn,
        status: status ?? this.status,
        deliveredAt: deliveredAt ?? this.deliveredAt,
        createdAt: createdAt ?? this.createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
      );

  /// Returns a new [FutureSelfNote] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FutureSelfNote? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "FutureSelfNote[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "FutureSelfNote[id]" has a null value in JSON.');
        assert(json.containsKey(r'deliverOn'),
            'Required key "FutureSelfNote[deliverOn]" is missing from JSON.');
        assert(json[r'deliverOn'] != null,
            'Required key "FutureSelfNote[deliverOn]" has a null value in JSON.');
        assert(json.containsKey(r'status'),
            'Required key "FutureSelfNote[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "FutureSelfNote[status]" has a null value in JSON.');
        assert(json.containsKey(r'deliveredAt'),
            'Required key "FutureSelfNote[deliveredAt]" is missing from JSON.');
        assert(json[r'deliveredAt'] != null,
            'Required key "FutureSelfNote[deliveredAt]" has a null value in JSON.');
        assert(json.containsKey(r'createdAt'),
            'Required key "FutureSelfNote[createdAt]" is missing from JSON.');
        assert(json[r'createdAt'] != null,
            'Required key "FutureSelfNote[createdAt]" has a null value in JSON.');
        assert(json.containsKey(r'updatedAt'),
            'Required key "FutureSelfNote[updatedAt]" is missing from JSON.');
        assert(json[r'updatedAt'] != null,
            'Required key "FutureSelfNote[updatedAt]" has a null value in JSON.');
        return true;
      }());

      return FutureSelfNote(
        id: mapValueOfType<String>(json, r'id')!,
        deliverOn: mapDateTime(json, r'deliverOn', r'')!,
        status: FutureSelfNoteStatus.fromJson(json[r'status'])!,
        deliveredAt: mapDateTime(json, r'deliveredAt', r'')!,
        createdAt: mapDateTime(json, r'createdAt', r'')!,
        updatedAt: mapDateTime(json, r'updatedAt', r'')!,
      );
    }
    return null;
  }

  static List<FutureSelfNote> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <FutureSelfNote>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FutureSelfNote.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FutureSelfNote> mapFromJson(dynamic json) {
    final map = <String, FutureSelfNote>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FutureSelfNote.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FutureSelfNote-objects as value to a dart map
  static Map<String, List<FutureSelfNote>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<FutureSelfNote>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FutureSelfNote.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'deliverOn',
    'status',
    'deliveredAt',
    'createdAt',
    'updatedAt',
  };
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FutureSelfNoteDetail {
  /// Returns a new [FutureSelfNoteDetail] instance.
  FutureSelfNoteDetail({
    required this.id,
    required this.deliverOn,
    required this.status,
    required this.deliveredAt,
    required this.createdAt,
    required this.updatedAt,
    required this.body,
  });

  final String id;

  final String deliverOn;

  final FutureSelfNoteStatus status;

  final DateTime deliveredAt;

  final DateTime createdAt;

  final DateTime updatedAt;

  /// The note text. Present only on or after deliverOn.
  final String body;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is FutureSelfNoteDetail &&
          other.id == id &&
          other.deliverOn == deliverOn &&
          other.status == status &&
          other.deliveredAt == deliveredAt &&
          other.createdAt == createdAt &&
          other.updatedAt == updatedAt &&
          other.body == body;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (deliverOn.hashCode) +
      (status.hashCode) +
      (deliveredAt.hashCode) +
      (createdAt.hashCode) +
      (updatedAt.hashCode) +
      (body.hashCode);

  @override
  String toString() =>
      'FutureSelfNoteDetail[id=$id, deliverOn=$deliverOn, status=$status, deliveredAt=$deliveredAt, createdAt=$createdAt, updatedAt=$updatedAt, body=$body]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'deliverOn'] = _dateFormatter.format(this.deliverOn);
    json[r'status'] = this.status;
    json[r'deliveredAt'] = this.deliveredAt.toUtc().toIso8601String();
    json[r'createdAt'] = this.createdAt.toUtc().toIso8601String();
    json[r'updatedAt'] = this.updatedAt.toUtc().toIso8601String();
    json[r'body'] = this.body;
    return json;
  }

  /// Clones this instance of [FutureSelfNoteDetail] and returns a new one where some of the
  /// properties have changed.
  FutureSelfNoteDetail copyWith({
    String? id,
    String? deliverOn,
    FutureSelfNoteStatus? status,
    DateTime? deliveredAt,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? body,
  }) =>
      FutureSelfNoteDetail(
        id: id ?? this.id,
        deliverOn: deliverOn ?? this.deliverOn,
        status: status ?? this.status,
        deliveredAt: deliveredAt ?? this.deliveredAt,
        createdAt: createdAt ?? this.createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        body: body ?? this.body,
      );

  /// Returns a new [FutureSelfNoteDetail] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FutureSelfNoteDetail? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "FutureSelfNoteDetail[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "FutureSelfNoteDetail[id]" has a null value in JSON.');
        assert(json.containsKey(r'deliverOn'),
            'Required key "FutureSelfNoteDetail[deliverOn]" is missing from JSON.');
        assert(json[r'deliverOn'] != null,
            'Required key "FutureSelfNoteDetail[deliverOn]" has a null value in JSON.');
        assert(json.containsKey(r'status'),
            'Required key "FutureSelfNoteDetail[status]" is missing from JSON.');
        assert(json[r'status'] != null,
            'Required key "FutureSelfNoteDetail[status]" has a null value in JSON.');
        assert(json.containsKey(r'deliveredAt'),
            'Required key "FutureSelfNoteDetail[deliveredAt]" is missing from JSON.');
        assert(json[r'deliveredAt'] != null,
            'Required key "FutureSelfNoteDetail[deliveredAt]" has a null value in JSON.');
        assert(json.containsKey(r'createdAt'),
            'Required key "FutureSelfNoteDetail[createdAt]" is missing from JSON.');
        assert(json[r'createdAt'] != null,
            'Required key "FutureSelfNoteDetail[createdAt]" has a null value in JSON.');
        assert(json.containsKey(r'updatedAt'),
            'Required key "FutureSelfNoteDetail[updatedAt]" is missing from JSON.');
        assert(json[r'updatedAt'] != null,
            'Required key "FutureSelfNoteDetail[updatedAt]" has a null value in JSON.');
        assert(json.containsKey(r'body'),
            'Required key "FutureSelfNoteDetail[body]" is missing from JSON.');
        assert(json[r'body'] != null,
            'Required key "FutureSelfNoteDetail[body]" has a null value in JSON.');
        return true;
      }());

      return FutureSelfNoteDetail(
        id: mapValueOfType<String>(json, r'id')!,
        deliverOn: mapDateTime(json, r'deliverOn', r'')!,
        status: FutureSelfNoteStatus.fromJson(json[r'status'])!,
        deliveredAt: mapDateTime(json, r'deliveredAt', r'')!,
        createdAt: mapDateTime(json, r'createdAt', r'')!,
        updatedAt: mapDateTime(json, r'updatedAt', r'')!,
        body: mapValueOfType<String>(json, r'body')!,
      );
    }
    return null;
  }

  static List<FutureSelfNoteDetail> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <FutureSelfNoteDetail>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FutureSelfNoteDetail.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FutureSelfNoteDetail> mapFromJson(dynamic json) {
    final map = <String, FutureSelfNoteDetail>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FutureSelfNoteDetail.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FutureSelfNoteDetail-objects as value to a dart map
  static Map<String, List<FutureSelfNoteDetail>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<FutureSelfNoteDetail>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FutureSelfNoteDetail.listFromJson(
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
    'body',
  };
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class TrashedPostStatus {
  /// Returns a new [TrashedPostStatus] instance.
  TrashedPostStatus({
    required this.id,
    required this.localDate,
    required this.trashedAt,
    required this.restoreUntil,
    required this.purgeDueAt,
    required this.generation,
    required this.pendingCleanup,
    required this.failureCategory,
  });

  final String id;

  final String localDate;

  final DateTime trashedAt;

  final DateTime restoreUntil;

  final DateTime purgeDueAt;

  /// Minimum value: 0
  final int generation;

  final bool pendingCleanup;

  final String failureCategory;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TrashedPostStatus &&
          other.id == id &&
          other.localDate == localDate &&
          other.trashedAt == trashedAt &&
          other.restoreUntil == restoreUntil &&
          other.purgeDueAt == purgeDueAt &&
          other.generation == generation &&
          other.pendingCleanup == pendingCleanup &&
          other.failureCategory == failureCategory;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (localDate.hashCode) +
      (trashedAt.hashCode) +
      (restoreUntil.hashCode) +
      (purgeDueAt.hashCode) +
      (generation.hashCode) +
      (pendingCleanup.hashCode) +
      (failureCategory.hashCode);

  @override
  String toString() =>
      'TrashedPostStatus[id=$id, localDate=$localDate, trashedAt=$trashedAt, restoreUntil=$restoreUntil, purgeDueAt=$purgeDueAt, generation=$generation, pendingCleanup=$pendingCleanup, failureCategory=$failureCategory]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'localDate'] = this.localDate;
    json[r'trashedAt'] = this.trashedAt.toUtc().toIso8601String();
    json[r'restoreUntil'] = this.restoreUntil.toUtc().toIso8601String();
    json[r'purgeDueAt'] = this.purgeDueAt.toUtc().toIso8601String();
    json[r'generation'] = this.generation;
    json[r'pendingCleanup'] = this.pendingCleanup;
    json[r'failureCategory'] = this.failureCategory;
    return json;
  }

  /// Clones this instance of [TrashedPostStatus] and returns a new one where some of the
  /// properties have changed.
  TrashedPostStatus copyWith({
    String? id,
    String? localDate,
    DateTime? trashedAt,
    DateTime? restoreUntil,
    DateTime? purgeDueAt,
    int? generation,
    bool? pendingCleanup,
    String? failureCategory,
  }) =>
      TrashedPostStatus(
        id: id ?? this.id,
        localDate: localDate ?? this.localDate,
        trashedAt: trashedAt ?? this.trashedAt,
        restoreUntil: restoreUntil ?? this.restoreUntil,
        purgeDueAt: purgeDueAt ?? this.purgeDueAt,
        generation: generation ?? this.generation,
        pendingCleanup: pendingCleanup ?? this.pendingCleanup,
        failureCategory: failureCategory ?? this.failureCategory,
      );

  /// Returns a new [TrashedPostStatus] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static TrashedPostStatus? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "TrashedPostStatus[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "TrashedPostStatus[id]" has a null value in JSON.');
        assert(json.containsKey(r'localDate'),
            'Required key "TrashedPostStatus[localDate]" is missing from JSON.');
        assert(json[r'localDate'] != null,
            'Required key "TrashedPostStatus[localDate]" has a null value in JSON.');
        assert(json.containsKey(r'trashedAt'),
            'Required key "TrashedPostStatus[trashedAt]" is missing from JSON.');
        assert(json[r'trashedAt'] != null,
            'Required key "TrashedPostStatus[trashedAt]" has a null value in JSON.');
        assert(json.containsKey(r'restoreUntil'),
            'Required key "TrashedPostStatus[restoreUntil]" is missing from JSON.');
        assert(json[r'restoreUntil'] != null,
            'Required key "TrashedPostStatus[restoreUntil]" has a null value in JSON.');
        assert(json.containsKey(r'purgeDueAt'),
            'Required key "TrashedPostStatus[purgeDueAt]" is missing from JSON.');
        assert(json[r'purgeDueAt'] != null,
            'Required key "TrashedPostStatus[purgeDueAt]" has a null value in JSON.');
        assert(json.containsKey(r'generation'),
            'Required key "TrashedPostStatus[generation]" is missing from JSON.');
        assert(json[r'generation'] != null,
            'Required key "TrashedPostStatus[generation]" has a null value in JSON.');
        assert(json.containsKey(r'pendingCleanup'),
            'Required key "TrashedPostStatus[pendingCleanup]" is missing from JSON.');
        assert(json[r'pendingCleanup'] != null,
            'Required key "TrashedPostStatus[pendingCleanup]" has a null value in JSON.');
        assert(json.containsKey(r'failureCategory'),
            'Required key "TrashedPostStatus[failureCategory]" is missing from JSON.');
        assert(json[r'failureCategory'] != null,
            'Required key "TrashedPostStatus[failureCategory]" has a null value in JSON.');
        return true;
      }());

      return TrashedPostStatus(
        id: mapValueOfType<String>(json, r'id')!,
        localDate: mapValueOfType<String>(json, r'localDate')!,
        trashedAt: mapDateTime(json, r'trashedAt', r'')!,
        restoreUntil: mapDateTime(json, r'restoreUntil', r'')!,
        purgeDueAt: mapDateTime(json, r'purgeDueAt', r'')!,
        generation: mapValueOfType<int>(json, r'generation')!,
        pendingCleanup: mapValueOfType<bool>(json, r'pendingCleanup')!,
        failureCategory: mapValueOfType<String>(json, r'failureCategory')!,
      );
    }
    return null;
  }

  static List<TrashedPostStatus> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <TrashedPostStatus>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = TrashedPostStatus.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, TrashedPostStatus> mapFromJson(dynamic json) {
    final map = <String, TrashedPostStatus>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = TrashedPostStatus.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of TrashedPostStatus-objects as value to a dart map
  static Map<String, List<TrashedPostStatus>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<TrashedPostStatus>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = TrashedPostStatus.listFromJson(
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
    'localDate',
    'trashedAt',
    'restoreUntil',
    'purgeDueAt',
    'generation',
    'pendingCleanup',
    'failureCategory',
  };
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CurrentPostingDayResponse {
  /// Returns a new [CurrentPostingDayResponse] instance.
  CurrentPostingDayResponse({
    required this.serverNow,
    required this.localDate,
    required this.deadlineAt,
    required this.releaseAt,
    required this.prompt,
    required this.hasPosted,
  });

  final DateTime serverNow;

  final String localDate;

  final DateTime deadlineAt;

  final DateTime releaseAt;

  final DailyPromptResponse prompt;

  final bool hasPosted;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CurrentPostingDayResponse &&
          other.serverNow == serverNow &&
          other.localDate == localDate &&
          other.deadlineAt == deadlineAt &&
          other.releaseAt == releaseAt &&
          other.prompt == prompt &&
          other.hasPosted == hasPosted;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (serverNow.hashCode) +
      (localDate.hashCode) +
      (deadlineAt.hashCode) +
      (releaseAt.hashCode) +
      (prompt.hashCode) +
      (hasPosted.hashCode);

  @override
  String toString() =>
      'CurrentPostingDayResponse[serverNow=$serverNow, localDate=$localDate, deadlineAt=$deadlineAt, releaseAt=$releaseAt, prompt=$prompt, hasPosted=$hasPosted]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'serverNow'] = this.serverNow.toUtc().toIso8601String();
    json[r'localDate'] = this.localDate;
    json[r'deadlineAt'] = this.deadlineAt.toUtc().toIso8601String();
    json[r'releaseAt'] = this.releaseAt.toUtc().toIso8601String();
    json[r'prompt'] = this.prompt;
    json[r'hasPosted'] = this.hasPosted;
    return json;
  }

  /// Clones this instance of [CurrentPostingDayResponse] and returns a new one where some of the
  /// properties have changed.
  CurrentPostingDayResponse copyWith({
    DateTime? serverNow,
    String? localDate,
    DateTime? deadlineAt,
    DateTime? releaseAt,
    DailyPromptResponse? prompt,
    bool? hasPosted,
  }) =>
      CurrentPostingDayResponse(
        serverNow: serverNow ?? this.serverNow,
        localDate: localDate ?? this.localDate,
        deadlineAt: deadlineAt ?? this.deadlineAt,
        releaseAt: releaseAt ?? this.releaseAt,
        prompt: prompt ?? this.prompt,
        hasPosted: hasPosted ?? this.hasPosted,
      );

  /// Returns a new [CurrentPostingDayResponse] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CurrentPostingDayResponse? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'serverNow'),
            'Required key "CurrentPostingDayResponse[serverNow]" is missing from JSON.');
        assert(json[r'serverNow'] != null,
            'Required key "CurrentPostingDayResponse[serverNow]" has a null value in JSON.');
        assert(json.containsKey(r'localDate'),
            'Required key "CurrentPostingDayResponse[localDate]" is missing from JSON.');
        assert(json[r'localDate'] != null,
            'Required key "CurrentPostingDayResponse[localDate]" has a null value in JSON.');
        assert(json.containsKey(r'deadlineAt'),
            'Required key "CurrentPostingDayResponse[deadlineAt]" is missing from JSON.');
        assert(json[r'deadlineAt'] != null,
            'Required key "CurrentPostingDayResponse[deadlineAt]" has a null value in JSON.');
        assert(json.containsKey(r'releaseAt'),
            'Required key "CurrentPostingDayResponse[releaseAt]" is missing from JSON.');
        assert(json[r'releaseAt'] != null,
            'Required key "CurrentPostingDayResponse[releaseAt]" has a null value in JSON.');
        assert(json.containsKey(r'prompt'),
            'Required key "CurrentPostingDayResponse[prompt]" is missing from JSON.');
        assert(json[r'prompt'] != null,
            'Required key "CurrentPostingDayResponse[prompt]" has a null value in JSON.');
        assert(json.containsKey(r'hasPosted'),
            'Required key "CurrentPostingDayResponse[hasPosted]" is missing from JSON.');
        assert(json[r'hasPosted'] != null,
            'Required key "CurrentPostingDayResponse[hasPosted]" has a null value in JSON.');
        return true;
      }());

      return CurrentPostingDayResponse(
        serverNow: mapDateTime(json, r'serverNow', r'')!,
        localDate: mapValueOfType<String>(json, r'localDate')!,
        deadlineAt: mapDateTime(json, r'deadlineAt', r'')!,
        releaseAt: mapDateTime(json, r'releaseAt', r'')!,
        prompt: DailyPromptResponse.fromJson(json[r'prompt'])!,
        hasPosted: mapValueOfType<bool>(json, r'hasPosted')!,
      );
    }
    return null;
  }

  static List<CurrentPostingDayResponse> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <CurrentPostingDayResponse>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CurrentPostingDayResponse.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CurrentPostingDayResponse> mapFromJson(dynamic json) {
    final map = <String, CurrentPostingDayResponse>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CurrentPostingDayResponse.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CurrentPostingDayResponse-objects as value to a dart map
  static Map<String, List<CurrentPostingDayResponse>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<CurrentPostingDayResponse>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CurrentPostingDayResponse.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'serverNow',
    'localDate',
    'deadlineAt',
    'releaseAt',
    'prompt',
    'hasPosted',
  };
}

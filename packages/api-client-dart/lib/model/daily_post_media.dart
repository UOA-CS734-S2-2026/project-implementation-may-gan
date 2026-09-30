//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class DailyPostMedia {
  /// Returns a new [DailyPostMedia] instance.
  DailyPostMedia({
    required this.id,
    required this.contentType,
    required this.order,
  });

  final String id;

  final MediaContentType contentType;

  /// Minimum value: 0
  final int order;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DailyPostMedia &&
          other.id == id &&
          other.contentType == contentType &&
          other.order == order;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) + (contentType.hashCode) + (order.hashCode);

  @override
  String toString() =>
      'DailyPostMedia[id=$id, contentType=$contentType, order=$order]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'contentType'] = this.contentType;
    json[r'order'] = this.order;
    return json;
  }

  /// Clones this instance of [DailyPostMedia] and returns a new one where some of the
  /// properties have changed.
  DailyPostMedia copyWith({
    String? id,
    MediaContentType? contentType,
    int? order,
  }) =>
      DailyPostMedia(
        id: id ?? this.id,
        contentType: contentType ?? this.contentType,
        order: order ?? this.order,
      );

  /// Returns a new [DailyPostMedia] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static DailyPostMedia? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "DailyPostMedia[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "DailyPostMedia[id]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'),
            'Required key "DailyPostMedia[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null,
            'Required key "DailyPostMedia[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'order'),
            'Required key "DailyPostMedia[order]" is missing from JSON.');
        assert(json[r'order'] != null,
            'Required key "DailyPostMedia[order]" has a null value in JSON.');
        return true;
      }());

      return DailyPostMedia(
        id: mapValueOfType<String>(json, r'id')!,
        contentType: MediaContentType.fromJson(json[r'contentType'])!,
        order: mapValueOfType<int>(json, r'order')!,
      );
    }
    return null;
  }

  static List<DailyPostMedia> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <DailyPostMedia>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = DailyPostMedia.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, DailyPostMedia> mapFromJson(dynamic json) {
    final map = <String, DailyPostMedia>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = DailyPostMedia.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of DailyPostMedia-objects as value to a dart map
  static Map<String, List<DailyPostMedia>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<DailyPostMedia>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = DailyPostMedia.listFromJson(
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
    'contentType',
    'order',
  };
}

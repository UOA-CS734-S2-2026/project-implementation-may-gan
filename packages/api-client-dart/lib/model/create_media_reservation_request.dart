//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateMediaReservationRequest {
  /// Returns a new [CreateMediaReservationRequest] instance.
  CreateMediaReservationRequest({
    required this.contentType,
    required this.byteSize,
  });

  final MediaContentType contentType;

  /// Minimum value: 0
  /// Maximum value: 10485760
  final int byteSize;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CreateMediaReservationRequest &&
          other.contentType == contentType &&
          other.byteSize == byteSize;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (contentType.hashCode) + (byteSize.hashCode);

  @override
  String toString() =>
      'CreateMediaReservationRequest[contentType=$contentType, byteSize=$byteSize]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'contentType'] = this.contentType;
    json[r'byteSize'] = this.byteSize;
    return json;
  }

  /// Clones this instance of [CreateMediaReservationRequest] and returns a new one where some of the
  /// properties have changed.
  CreateMediaReservationRequest copyWith({
    MediaContentType? contentType,
    int? byteSize,
  }) =>
      CreateMediaReservationRequest(
        contentType: contentType ?? this.contentType,
        byteSize: byteSize ?? this.byteSize,
      );

  /// Returns a new [CreateMediaReservationRequest] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateMediaReservationRequest? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'contentType'),
            'Required key "CreateMediaReservationRequest[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null,
            'Required key "CreateMediaReservationRequest[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'byteSize'),
            'Required key "CreateMediaReservationRequest[byteSize]" is missing from JSON.');
        assert(json[r'byteSize'] != null,
            'Required key "CreateMediaReservationRequest[byteSize]" has a null value in JSON.');
        return true;
      }());

      return CreateMediaReservationRequest(
        contentType: MediaContentType.fromJson(json[r'contentType'])!,
        byteSize: mapValueOfType<int>(json, r'byteSize')!,
      );
    }
    return null;
  }

  static List<CreateMediaReservationRequest> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <CreateMediaReservationRequest>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreateMediaReservationRequest.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateMediaReservationRequest> mapFromJson(dynamic json) {
    final map = <String, CreateMediaReservationRequest>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateMediaReservationRequest.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateMediaReservationRequest-objects as value to a dart map
  static Map<String, List<CreateMediaReservationRequest>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<CreateMediaReservationRequest>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreateMediaReservationRequest.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'contentType',
    'byteSize',
  };
}

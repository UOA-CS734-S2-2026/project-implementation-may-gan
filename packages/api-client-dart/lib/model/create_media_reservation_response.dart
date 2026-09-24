//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class CreateMediaReservationResponse {
  /// Returns a new [CreateMediaReservationResponse] instance.
  CreateMediaReservationResponse({
    required this.id,
    required this.contentType,
    required this.byteSize,
    required this.status,
    required this.createdAt,
    required this.expiresAt,
    required this.upload,
  });

  final String id;

  final MediaContentType contentType;

  /// Minimum value: 0
  final int byteSize;

  final MediaReservationStatus status;

  final DateTime createdAt;

  final DateTime expiresAt;

  final MediaReservationUpload upload;

  @override
  bool operator ==(Object other) => identical(this, other) || other is CreateMediaReservationResponse &&
    other.id == id &&
    other.contentType == contentType &&
    other.byteSize == byteSize &&
    other.status == status &&
    other.createdAt == createdAt &&
    other.expiresAt == expiresAt &&
    other.upload == upload;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (id.hashCode) +
    (contentType.hashCode) +
    (byteSize.hashCode) +
    (status.hashCode) +
    (createdAt.hashCode) +
    (expiresAt.hashCode) +
    (upload.hashCode);

  @override
  String toString() => 'CreateMediaReservationResponse[id=$id, contentType=$contentType, byteSize=$byteSize, status=$status, createdAt=$createdAt, expiresAt=$expiresAt, upload=$upload]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'id'] = this.id;
      json[r'contentType'] = this.contentType;
      json[r'byteSize'] = this.byteSize;
      json[r'status'] = this.status;
      json[r'createdAt'] = this.createdAt.toUtc().toIso8601String();
      json[r'expiresAt'] = this.expiresAt.toUtc().toIso8601String();
      json[r'upload'] = this.upload;
    return json;
  }

  /// Clones this instance of [CreateMediaReservationResponse] and returns a new one where some of the
  /// properties have changed.
  CreateMediaReservationResponse copyWith({
    String? id,
    MediaContentType? contentType,
    int? byteSize,
    MediaReservationStatus? status,
    DateTime? createdAt,
    DateTime? expiresAt,
    MediaReservationUpload? upload,
  }) => CreateMediaReservationResponse(
    id: id ?? this.id,
    contentType: contentType ?? this.contentType,
    byteSize: byteSize ?? this.byteSize,
    status: status ?? this.status,
    createdAt: createdAt ?? this.createdAt,
    expiresAt: expiresAt ?? this.expiresAt,
    upload: upload ?? this.upload,
  );

  /// Returns a new [CreateMediaReservationResponse] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static CreateMediaReservationResponse? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'), 'Required key "CreateMediaReservationResponse[id]" is missing from JSON.');
        assert(json[r'id'] != null, 'Required key "CreateMediaReservationResponse[id]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'), 'Required key "CreateMediaReservationResponse[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null, 'Required key "CreateMediaReservationResponse[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'byteSize'), 'Required key "CreateMediaReservationResponse[byteSize]" is missing from JSON.');
        assert(json[r'byteSize'] != null, 'Required key "CreateMediaReservationResponse[byteSize]" has a null value in JSON.');
        assert(json.containsKey(r'status'), 'Required key "CreateMediaReservationResponse[status]" is missing from JSON.');
        assert(json[r'status'] != null, 'Required key "CreateMediaReservationResponse[status]" has a null value in JSON.');
        assert(json.containsKey(r'createdAt'), 'Required key "CreateMediaReservationResponse[createdAt]" is missing from JSON.');
        assert(json[r'createdAt'] != null, 'Required key "CreateMediaReservationResponse[createdAt]" has a null value in JSON.');
        assert(json.containsKey(r'expiresAt'), 'Required key "CreateMediaReservationResponse[expiresAt]" is missing from JSON.');
        assert(json[r'expiresAt'] != null, 'Required key "CreateMediaReservationResponse[expiresAt]" has a null value in JSON.');
        assert(json.containsKey(r'upload'), 'Required key "CreateMediaReservationResponse[upload]" is missing from JSON.');
        assert(json[r'upload'] != null, 'Required key "CreateMediaReservationResponse[upload]" has a null value in JSON.');
        return true;
      }());

      return CreateMediaReservationResponse(
        id: mapValueOfType<String>(json, r'id')!,
        contentType: MediaContentType.fromJson(json[r'contentType'])!,
        byteSize: mapValueOfType<int>(json, r'byteSize')!,
        status: MediaReservationStatus.fromJson(json[r'status'])!,
        createdAt: mapDateTime(json, r'createdAt', r'')!,
        expiresAt: mapDateTime(json, r'expiresAt', r'')!,
        upload: MediaReservationUpload.fromJson(json[r'upload'])!,
      );
    }
    return null;
  }

  static List<CreateMediaReservationResponse> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <CreateMediaReservationResponse>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = CreateMediaReservationResponse.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, CreateMediaReservationResponse> mapFromJson(dynamic json) {
    final map = <String, CreateMediaReservationResponse>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = CreateMediaReservationResponse.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of CreateMediaReservationResponse-objects as value to a dart map
  static Map<String, List<CreateMediaReservationResponse>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<CreateMediaReservationResponse>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = CreateMediaReservationResponse.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
    'contentType',
    'byteSize',
    'status',
    'createdAt',
    'expiresAt',
    'upload',
  };
}

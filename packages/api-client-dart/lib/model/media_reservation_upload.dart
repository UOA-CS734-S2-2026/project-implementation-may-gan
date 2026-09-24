//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MediaReservationUpload {
  /// Returns a new [MediaReservationUpload] instance.
  MediaReservationUpload({
    required this.url,
    required this.method,
    this.requiredHeaders = const {},
  });

  final String url;

  final MediaReservationUploadMethodEnum method;

  final Map<String, String> requiredHeaders;

  @override
  bool operator ==(Object other) => identical(this, other) || other is MediaReservationUpload &&
    other.url == url &&
    other.method == method &&
    _deepEquality.equals(other.requiredHeaders, requiredHeaders);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (url.hashCode) +
    (method.hashCode) +
    (requiredHeaders.hashCode);

  @override
  String toString() => 'MediaReservationUpload[url=$url, method=$method, requiredHeaders=$requiredHeaders]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'url'] = this.url;
      json[r'method'] = this.method;
      json[r'requiredHeaders'] = this.requiredHeaders;
    return json;
  }

  /// Clones this instance of [MediaReservationUpload] and returns a new one where some of the
  /// properties have changed.
  MediaReservationUpload copyWith({
    String? url,
    MediaReservationUploadMethodEnum? method,
    Map<String, String>? requiredHeaders,
  }) => MediaReservationUpload(
    url: url ?? this.url,
    method: method ?? this.method,
    requiredHeaders: requiredHeaders ?? this.requiredHeaders,
  );

  /// Returns a new [MediaReservationUpload] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static MediaReservationUpload? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'url'), 'Required key "MediaReservationUpload[url]" is missing from JSON.');
        assert(json[r'url'] != null, 'Required key "MediaReservationUpload[url]" has a null value in JSON.');
        assert(json.containsKey(r'method'), 'Required key "MediaReservationUpload[method]" is missing from JSON.');
        assert(json[r'method'] != null, 'Required key "MediaReservationUpload[method]" has a null value in JSON.');
        assert(json.containsKey(r'requiredHeaders'), 'Required key "MediaReservationUpload[requiredHeaders]" is missing from JSON.');
        assert(json[r'requiredHeaders'] != null, 'Required key "MediaReservationUpload[requiredHeaders]" has a null value in JSON.');
        return true;
      }());

      return MediaReservationUpload(
        url: mapValueOfType<String>(json, r'url')!,
        method: MediaReservationUploadMethodEnum.fromJson(json[r'method'])!,
        requiredHeaders: mapCastOfType<String, String>(json, r'requiredHeaders')!,
      );
    }
    return null;
  }

  static List<MediaReservationUpload> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MediaReservationUpload>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MediaReservationUpload.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, MediaReservationUpload> mapFromJson(dynamic json) {
    final map = <String, MediaReservationUpload>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = MediaReservationUpload.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of MediaReservationUpload-objects as value to a dart map
  static Map<String, List<MediaReservationUpload>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<MediaReservationUpload>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = MediaReservationUpload.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'url',
    'method',
    'requiredHeaders',
  };
}


enum MediaReservationUploadMethodEnum {
  PUT._(r'PUT'),
  ;

  /// Instantiate a new enum with the provided value.
  const MediaReservationUploadMethodEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [MediaReservationUploadMethodEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static MediaReservationUploadMethodEnum? fromJson(dynamic value) => MediaReservationUploadMethodEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [MediaReservationUploadMethodEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<MediaReservationUploadMethodEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <MediaReservationUploadMethodEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = MediaReservationUploadMethodEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [MediaReservationUploadMethodEnum] to String,
/// and [decode] dynamic data back to [MediaReservationUploadMethodEnum].
class MediaReservationUploadMethodEnumTypeTransformer {
  factory MediaReservationUploadMethodEnumTypeTransformer() => _instance ??= const MediaReservationUploadMethodEnumTypeTransformer._();

  const MediaReservationUploadMethodEnumTypeTransformer._();

  String encode(MediaReservationUploadMethodEnum data) => data._value;

  /// Returns the instance of [MediaReservationUploadMethodEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  MediaReservationUploadMethodEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is MediaReservationUploadMethodEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'PUT': return MediaReservationUploadMethodEnum.PUT;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static MediaReservationUploadMethodEnumTypeTransformer? _instance;
}

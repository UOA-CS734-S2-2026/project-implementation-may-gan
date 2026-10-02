//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

enum PostMediaContentType {
  imageSlashJpeg._(r'image/jpeg'),
  imageSlashPng._(r'image/png'),
  imageSlashWebp._(r'image/webp'),
  imageSlashHeic._(r'image/heic'),
  videoSlashMp4._(r'video/mp4'),
  videoSlashQuicktime._(r'video/quicktime'),
  ;

  /// Instantiate a new enum with the provided value.
  const PostMediaContentType._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [PostMediaContentType] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static PostMediaContentType? fromJson(dynamic value) =>
      PostMediaContentTypeTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [PostMediaContentType]
  /// that were successfully decoded from the passed [JSON][json].
  static List<PostMediaContentType> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostMediaContentType>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostMediaContentType.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [PostMediaContentType] to String,
/// and [decode] dynamic data back to [PostMediaContentType].
class PostMediaContentTypeTypeTransformer {
  factory PostMediaContentTypeTypeTransformer() =>
      _instance ??= const PostMediaContentTypeTypeTransformer._();

  const PostMediaContentTypeTypeTransformer._();

  /// Encodes this enum as a value suitable for JSON.
  String encode(PostMediaContentType data) => data._value;

  /// Returns the instance of [PostMediaContentType] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  PostMediaContentType? decode(dynamic data, {bool allowNull = true}) {
    if (data is PostMediaContentType) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'image/jpeg':
          return PostMediaContentType.imageSlashJpeg;
        case r'image/png':
          return PostMediaContentType.imageSlashPng;
        case r'image/webp':
          return PostMediaContentType.imageSlashWebp;
        case r'image/heic':
          return PostMediaContentType.imageSlashHeic;
        case r'video/mp4':
          return PostMediaContentType.videoSlashMp4;
        case r'video/quicktime':
          return PostMediaContentType.videoSlashQuicktime;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static PostMediaContentTypeTypeTransformer? _instance;
}

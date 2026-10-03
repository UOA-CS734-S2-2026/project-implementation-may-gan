//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ReadableProfilePosts {
  /// Returns a new [ReadableProfilePosts] instance.
  ReadableProfilePosts({
    required this.kind,
    this.username,
    this.items = const [],
    this.nextCursor,
    this.hasMore,
  });

  final ReadableProfilePostsKindEnum kind;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final String? username;

  final List<ProfilePost> items;

  final String? nextCursor;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  final bool? hasMore;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ReadableProfilePosts &&
          other.kind == kind &&
          other.username == username &&
          _deepEquality.equals(other.items, items) &&
          other.nextCursor == nextCursor &&
          other.hasMore == hasMore;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (kind.hashCode) +
      (username == null ? 0 : username!.hashCode) +
      (items.hashCode) +
      (nextCursor == null ? 0 : nextCursor!.hashCode) +
      (hasMore == null ? 0 : hasMore!.hashCode);

  @override
  String toString() =>
      'ReadableProfilePosts[kind=$kind, username=$username, items=$items, nextCursor=$nextCursor, hasMore=$hasMore]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'kind'] = this.kind;
    if (this.username != null) {
      json[r'username'] = this.username;
    } else {
      json[r'username'] = null;
    }
    json[r'items'] = this.items;
    if (this.nextCursor != null) {
      json[r'nextCursor'] = this.nextCursor;
    } else {
      json[r'nextCursor'] = null;
    }
    if (this.hasMore != null) {
      json[r'hasMore'] = this.hasMore;
    } else {
      json[r'hasMore'] = null;
    }
    return json;
  }

  /// Clones this instance of [ReadableProfilePosts] and returns a new one where some of the
  /// properties have changed.
  ReadableProfilePosts copyWith({
    ReadableProfilePostsKindEnum? kind,
    String? username,
    List<ProfilePost>? items,
    String? nextCursor,
    bool nextCursorSetToNull = false,
    bool? hasMore,
  }) =>
      ReadableProfilePosts(
        kind: kind ?? this.kind,
        username: username ?? this.username,
        items: items ?? this.items,
        nextCursor: nextCursorSetToNull ? null : nextCursor ?? this.nextCursor,
        hasMore: hasMore ?? this.hasMore,
      );

  /// Returns a new [ReadableProfilePosts] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ReadableProfilePosts? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'kind'),
            'Required key "ReadableProfilePosts[kind]" is missing from JSON.');
        assert(json[r'kind'] != null,
            'Required key "ReadableProfilePosts[kind]" has a null value in JSON.');
        return true;
      }());

      return ReadableProfilePosts(
        kind: ReadableProfilePostsKindEnum.fromJson(json[r'kind'])!,
        username: mapValueOfType<String>(json, r'username'),
        items: ProfilePost.listFromJson(json[r'items']),
        nextCursor: mapValueOfType<String>(json, r'nextCursor'),
        hasMore: mapValueOfType<bool>(json, r'hasMore'),
      );
    }
    return null;
  }

  static List<ReadableProfilePosts> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ReadableProfilePosts>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReadableProfilePosts.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ReadableProfilePosts> mapFromJson(dynamic json) {
    final map = <String, ReadableProfilePosts>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ReadableProfilePosts.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ReadableProfilePosts-objects as value to a dart map
  static Map<String, List<ReadableProfilePosts>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<ReadableProfilePosts>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ReadableProfilePosts.listFromJson(
          entry.value,
          growable: growable,
        );
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'kind',
  };
}

enum ReadableProfilePostsKindEnum {
  archive._(r'archive'),
  restricted._(r'restricted'),
  ;

  /// Instantiate a new enum with the provided value.
  const ReadableProfilePostsKindEnum._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [ReadableProfilePostsKindEnum] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static ReadableProfilePostsKindEnum? fromJson(dynamic value) =>
      ReadableProfilePostsKindEnumTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [ReadableProfilePostsKindEnum]
  /// that were successfully decoded from the passed [JSON][json].
  static List<ReadableProfilePostsKindEnum> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <ReadableProfilePostsKindEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReadableProfilePostsKindEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ReadableProfilePostsKindEnum] to String,
/// and [decode] dynamic data back to [ReadableProfilePostsKindEnum].
class ReadableProfilePostsKindEnumTypeTransformer {
  factory ReadableProfilePostsKindEnumTypeTransformer() =>
      _instance ??= const ReadableProfilePostsKindEnumTypeTransformer._();

  const ReadableProfilePostsKindEnumTypeTransformer._();

  String encode(ReadableProfilePostsKindEnum data) => data._value;

  /// Returns the instance of [ReadableProfilePostsKindEnum] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ReadableProfilePostsKindEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data is ReadableProfilePostsKindEnum) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'archive':
          return ReadableProfilePostsKindEnum.archive;
        case r'restricted':
          return ReadableProfilePostsKindEnum.restricted;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static ReadableProfilePostsKindEnumTypeTransformer? _instance;
}

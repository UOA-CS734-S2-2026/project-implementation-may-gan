//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PostVoiceMemo {
  /// Returns a new [PostVoiceMemo] instance.
  PostVoiceMemo({
    required this.id,
    required this.contentType,
    required this.url,
    required this.expiresAt,
  });

  final String id;

  final VoiceMemoContentType contentType;

  /// A private download URL that expires at expiresAt. When media storage is unavailable, a response that would include a voice memo is a 503 instead.
  final String url;

  /// When a signed private URL stops working. Null for a Worker URL that reauthorizes every request.
  final DateTime? expiresAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PostVoiceMemo &&
          other.id == id &&
          other.contentType == contentType &&
          other.url == url &&
          other.expiresAt == expiresAt;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (contentType.hashCode) +
      (url.hashCode) +
      (expiresAt == null ? 0 : expiresAt!.hashCode);

  @override
  String toString() =>
      'PostVoiceMemo[id=$id, contentType=$contentType, url=$url, expiresAt=$expiresAt]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'contentType'] = this.contentType;
    json[r'url'] = this.url;
    if (this.expiresAt != null) {
      json[r'expiresAt'] = this.expiresAt!.toUtc().toIso8601String();
    } else {
      json[r'expiresAt'] = null;
    }
    return json;
  }

  /// Clones this instance of [PostVoiceMemo] and returns a new one where some of the
  /// properties have changed.
  PostVoiceMemo copyWith({
    String? id,
    VoiceMemoContentType? contentType,
    String? url,
    DateTime? expiresAt,
    bool expiresAtSetToNull = false,
  }) =>
      PostVoiceMemo(
        id: id ?? this.id,
        contentType: contentType ?? this.contentType,
        url: url ?? this.url,
        expiresAt: expiresAtSetToNull ? null : expiresAt ?? this.expiresAt,
      );

  /// Returns a new [PostVoiceMemo] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PostVoiceMemo? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "PostVoiceMemo[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "PostVoiceMemo[id]" has a null value in JSON.');
        assert(json.containsKey(r'contentType'),
            'Required key "PostVoiceMemo[contentType]" is missing from JSON.');
        assert(json[r'contentType'] != null,
            'Required key "PostVoiceMemo[contentType]" has a null value in JSON.');
        assert(json.containsKey(r'url'),
            'Required key "PostVoiceMemo[url]" is missing from JSON.');
        assert(json[r'url'] != null,
            'Required key "PostVoiceMemo[url]" has a null value in JSON.');
        assert(json.containsKey(r'expiresAt'),
            'Required key "PostVoiceMemo[expiresAt]" is missing from JSON.');
        return true;
      }());

      return PostVoiceMemo(
        id: mapValueOfType<String>(json, r'id')!,
        contentType: VoiceMemoContentType.fromJson(json[r'contentType'])!,
        url: mapValueOfType<String>(json, r'url')!,
        expiresAt: mapDateTime(json, r'expiresAt', r''),
      );
    }
    return null;
  }

  static List<PostVoiceMemo> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostVoiceMemo>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostVoiceMemo.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PostVoiceMemo> mapFromJson(dynamic json) {
    final map = <String, PostVoiceMemo>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PostVoiceMemo.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PostVoiceMemo-objects as value to a dart map
  static Map<String, List<PostVoiceMemo>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PostVoiceMemo>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PostVoiceMemo.listFromJson(
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
    'url',
    'expiresAt',
  };
}

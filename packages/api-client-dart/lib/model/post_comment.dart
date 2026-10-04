//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PostComment {
  /// Returns a new [PostComment] instance.
  PostComment({
    required this.id,
    required this.postId,
    required this.parentCommentId,
    required this.author,
    required this.text,
    required this.createdAt,
    required this.editedAt,
    required this.viewerCanEdit,
    required this.viewerCanDelete,
  });

  final String id;

  final String postId;

  /// The top-level comment this replies to. Replies go one level deep.
  final String? parentCommentId;

  final InteractionPerson author;

  final String text;

  final DateTime createdAt;

  final DateTime? editedAt;

  /// True for the comment's author.
  final bool viewerCanEdit;

  /// True for the comment's author and the post's author.
  final bool viewerCanDelete;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PostComment &&
          other.id == id &&
          other.postId == postId &&
          other.parentCommentId == parentCommentId &&
          other.author == author &&
          other.text == text &&
          other.createdAt == createdAt &&
          other.editedAt == editedAt &&
          other.viewerCanEdit == viewerCanEdit &&
          other.viewerCanDelete == viewerCanDelete;

  @override
  int get hashCode =>
      // ignore: unnecessary_parenthesis
      (id.hashCode) +
      (postId.hashCode) +
      (parentCommentId == null ? 0 : parentCommentId!.hashCode) +
      (author.hashCode) +
      (text.hashCode) +
      (createdAt.hashCode) +
      (editedAt == null ? 0 : editedAt!.hashCode) +
      (viewerCanEdit.hashCode) +
      (viewerCanDelete.hashCode);

  @override
  String toString() =>
      'PostComment[id=$id, postId=$postId, parentCommentId=$parentCommentId, author=$author, text=$text, createdAt=$createdAt, editedAt=$editedAt, viewerCanEdit=$viewerCanEdit, viewerCanDelete=$viewerCanDelete]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    json[r'id'] = this.id;
    json[r'postId'] = this.postId;
    if (this.parentCommentId != null) {
      json[r'parentCommentId'] = this.parentCommentId;
    } else {
      json[r'parentCommentId'] = null;
    }
    json[r'author'] = this.author;
    json[r'text'] = this.text;
    json[r'createdAt'] = this.createdAt.toUtc().toIso8601String();
    if (this.editedAt != null) {
      json[r'editedAt'] = this.editedAt!.toUtc().toIso8601String();
    } else {
      json[r'editedAt'] = null;
    }
    json[r'viewerCanEdit'] = this.viewerCanEdit;
    json[r'viewerCanDelete'] = this.viewerCanDelete;
    return json;
  }

  /// Clones this instance of [PostComment] and returns a new one where some of the
  /// properties have changed.
  PostComment copyWith({
    String? id,
    String? postId,
    String? parentCommentId,
    bool parentCommentIdSetToNull = false,
    InteractionPerson? author,
    String? text,
    DateTime? createdAt,
    DateTime? editedAt,
    bool editedAtSetToNull = false,
    bool? viewerCanEdit,
    bool? viewerCanDelete,
  }) =>
      PostComment(
        id: id ?? this.id,
        postId: postId ?? this.postId,
        parentCommentId: parentCommentIdSetToNull
            ? null
            : parentCommentId ?? this.parentCommentId,
        author: author ?? this.author,
        text: text ?? this.text,
        createdAt: createdAt ?? this.createdAt,
        editedAt: editedAtSetToNull ? null : editedAt ?? this.editedAt,
        viewerCanEdit: viewerCanEdit ?? this.viewerCanEdit,
        viewerCanDelete: viewerCanDelete ?? this.viewerCanDelete,
      );

  /// Returns a new [PostComment] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static PostComment? fromJson(dynamic value) {
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      // Ensure that the map contains the required keys.
      // Note 1: the values aren't checked for validity beyond being non-null.
      // Note 2: this code is stripped in release mode!
      assert(() {
        assert(json.containsKey(r'id'),
            'Required key "PostComment[id]" is missing from JSON.');
        assert(json[r'id'] != null,
            'Required key "PostComment[id]" has a null value in JSON.');
        assert(json.containsKey(r'postId'),
            'Required key "PostComment[postId]" is missing from JSON.');
        assert(json[r'postId'] != null,
            'Required key "PostComment[postId]" has a null value in JSON.');
        assert(json.containsKey(r'parentCommentId'),
            'Required key "PostComment[parentCommentId]" is missing from JSON.');
        assert(json.containsKey(r'author'),
            'Required key "PostComment[author]" is missing from JSON.');
        assert(json[r'author'] != null,
            'Required key "PostComment[author]" has a null value in JSON.');
        assert(json.containsKey(r'text'),
            'Required key "PostComment[text]" is missing from JSON.');
        assert(json[r'text'] != null,
            'Required key "PostComment[text]" has a null value in JSON.');
        assert(json.containsKey(r'createdAt'),
            'Required key "PostComment[createdAt]" is missing from JSON.');
        assert(json[r'createdAt'] != null,
            'Required key "PostComment[createdAt]" has a null value in JSON.');
        assert(json.containsKey(r'editedAt'),
            'Required key "PostComment[editedAt]" is missing from JSON.');
        assert(json.containsKey(r'viewerCanEdit'),
            'Required key "PostComment[viewerCanEdit]" is missing from JSON.');
        assert(json[r'viewerCanEdit'] != null,
            'Required key "PostComment[viewerCanEdit]" has a null value in JSON.');
        assert(json.containsKey(r'viewerCanDelete'),
            'Required key "PostComment[viewerCanDelete]" is missing from JSON.');
        assert(json[r'viewerCanDelete'] != null,
            'Required key "PostComment[viewerCanDelete]" has a null value in JSON.');
        return true;
      }());

      return PostComment(
        id: mapValueOfType<String>(json, r'id')!,
        postId: mapValueOfType<String>(json, r'postId')!,
        parentCommentId: mapValueOfType<String>(json, r'parentCommentId'),
        author: InteractionPerson.fromJson(json[r'author'])!,
        text: mapValueOfType<String>(json, r'text')!,
        createdAt: mapDateTime(json, r'createdAt', r'')!,
        editedAt: mapDateTime(json, r'editedAt', r''),
        viewerCanEdit: mapValueOfType<bool>(json, r'viewerCanEdit')!,
        viewerCanDelete: mapValueOfType<bool>(json, r'viewerCanDelete')!,
      );
    }
    return null;
  }

  static List<PostComment> listFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final result = <PostComment>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = PostComment.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, PostComment> mapFromJson(dynamic json) {
    final map = <String, PostComment>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = PostComment.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of PostComment-objects as value to a dart map
  static Map<String, List<PostComment>> mapListFromJson(
    dynamic json, {
    bool growable = false,
  }) {
    final map = <String, List<PostComment>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = PostComment.listFromJson(
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
    'postId',
    'parentCommentId',
    'author',
    'text',
    'createdAt',
    'editedAt',
    'viewerCanEdit',
    'viewerCanDelete',
  };
}

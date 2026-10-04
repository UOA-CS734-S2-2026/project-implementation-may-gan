import 'dart:convert';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;
import 'package:http/http.dart' as http;

import 'api_failure.dart';
import 'post_page.dart';
import 'posting_day_client.dart' show failureForStatus;

/// A post's like count and whether this user likes it.
class LikeSummary {
  const LikeSummary({required this.likeCount, required this.viewerHasLiked});

  final int likeCount;
  final bool viewerHasLiked;

  static LikeSummary? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final count = json['likeCount'];
    final liked = json['viewerHasLiked'];
    if (count is! int || liked is! bool) return null;
    return LikeSummary(likeCount: count, viewerHasLiked: liked);
  }
}

/// Someone who liked or commented.
class InteractionPerson {
  const InteractionPerson({
    required this.id,
    required this.username,
    required this.displayName,
  });

  final String id;
  final String username;
  final String displayName;

  static InteractionPerson? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final id = json['id'];
    final username = json['username'];
    final displayName = json['displayName'];
    if (id is! String || username is! String || displayName is! String) {
      return null;
    }
    return InteractionPerson(
      id: id,
      username: username,
      displayName: displayName,
    );
  }
}

class PostLike {
  const PostLike({required this.person, required this.likedAt});

  final InteractionPerson person;
  final DateTime likedAt;

  static PostLike? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final person = InteractionPerson.tryParse(json['person']);
    final likedAt = DateTime.tryParse('${json['likedAt']}');
    if (person == null || likedAt == null) return null;
    return PostLike(person: person, likedAt: likedAt);
  }
}

/// A comment, or a reply when [parentCommentId] is set.
class PostComment {
  const PostComment({
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
  final String? parentCommentId;
  final InteractionPerson author;
  final String text;
  final DateTime createdAt;
  final DateTime? editedAt;
  final bool viewerCanEdit;
  final bool viewerCanDelete;

  static PostComment? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final id = json['id'];
    final postId = json['postId'];
    final parent = json['parentCommentId'];
    final author = InteractionPerson.tryParse(json['author']);
    final text = json['text'];
    final createdAt = DateTime.tryParse('${json['createdAt']}');
    final edited = json['editedAt'];
    final editedAt = edited == null ? null : DateTime.tryParse('$edited');
    if (id is! String ||
        postId is! String ||
        (parent != null && parent is! String) ||
        author == null ||
        text is! String ||
        createdAt == null ||
        (edited != null && editedAt == null)) {
      return null;
    }
    return PostComment(
      id: id,
      postId: postId,
      parentCommentId: parent as String?,
      author: author,
      text: text,
      createdAt: createdAt,
      editedAt: editedAt,
      viewerCanEdit: json['viewerCanEdit'] == true,
      viewerCanDelete: json['viewerCanDelete'] == true,
    );
  }
}

/// Likes and comments. Every call is checked against the post on the server,
/// so [NotFound] means the post is gone or this user lost access to it.
abstract interface class InteractionsClient {
  Future<ApiResult<LikeSummary>> setLike(String postId, {required bool liked});

  Future<ApiResult<PostPage<PostLike>>> likes(String postId, {String? cursor});

  /// Comments and replies in the order they were written.
  Future<ApiResult<PostPage<PostComment>>> comments(
    String postId, {
    String? cursor,
  });

  /// Reuse [clientCommentId] for every retry of one comment; the server then
  /// returns the comment it already made instead of posting it twice.
  Future<ApiResult<PostComment>> createComment(
    String postId, {
    required String clientCommentId,
    required String text,
    String? parentCommentId,
  });

  Future<ApiResult<PostComment>> updateComment(
    String postId,
    String commentId,
    String text,
  );

  Future<ApiResult<void>> deleteComment(String postId, String commentId);
}

/// Used when the app has no API configured.
class UnavailableInteractionsClient implements InteractionsClient {
  const UnavailableInteractionsClient();

  @override
  Future<ApiResult<LikeSummary>> setLike(
    String postId, {
    required bool liked,
  }) async => const ApiError(ServiceUnavailable());

  @override
  Future<ApiResult<PostPage<PostLike>>> likes(
    String postId, {
    String? cursor,
  }) async => const ApiError(ServiceUnavailable());

  @override
  Future<ApiResult<PostPage<PostComment>>> comments(
    String postId, {
    String? cursor,
  }) async => const ApiError(ServiceUnavailable());

  @override
  Future<ApiResult<PostComment>> createComment(
    String postId, {
    required String clientCommentId,
    required String text,
    String? parentCommentId,
  }) async => const ApiError(ServiceUnavailable());

  @override
  Future<ApiResult<PostComment>> updateComment(
    String postId,
    String commentId,
    String text,
  ) async => const ApiError(ServiceUnavailable());

  @override
  Future<ApiResult<void>> deleteComment(
    String postId,
    String commentId,
  ) async => const ApiError(ServiceUnavailable());
}

/// Calls the generated interactions API with the stored Better Auth bearer
/// session and decodes the bodies here, like the other post clients.
class GeneratedInteractionsClient implements InteractionsClient {
  GeneratedInteractionsClient({
    required String baseUrl,
    required this._bearerToken,
    this._httpClient,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');

  final String _baseUrl;
  final Future<String?> Function() _bearerToken;
  final http.Client? _httpClient;

  @override
  Future<ApiResult<LikeSummary>> setLike(
    String postId, {
    required bool liked,
  }) => _request(
    (api) => liked
        ? api.interactionsLikeWithHttpInfo(postId)
        : api.interactionsUnlikeWithHttpInfo(postId),
    LikeSummary.tryParse,
  );

  @override
  Future<ApiResult<PostPage<PostLike>>> likes(
    String postId, {
    String? cursor,
  }) => _request(
    (api) => api.interactionsListLikesWithHttpInfo(postId, cursor: cursor),
    (json) => PostPage.tryParse(json, PostLike.tryParse),
  );

  @override
  Future<ApiResult<PostPage<PostComment>>> comments(
    String postId, {
    String? cursor,
  }) => _request(
    (api) => api.interactionsListCommentsWithHttpInfo(postId, cursor: cursor),
    (json) => PostPage.tryParse(json, PostComment.tryParse),
  );

  @override
  Future<ApiResult<PostComment>> createComment(
    String postId, {
    required String clientCommentId,
    required String text,
    String? parentCommentId,
  }) => _request(
    (api) => api.interactionsCreateCommentWithHttpInfo(
      postId,
      generated.CreatePostCommentRequest(
        clientCommentId: clientCommentId,
        text: text,
        parentCommentId: parentCommentId,
      ),
    ),
    PostComment.tryParse,
  );

  @override
  Future<ApiResult<PostComment>> updateComment(
    String postId,
    String commentId,
    String text,
  ) => _request(
    (api) => api.interactionsUpdateCommentWithHttpInfo(
      postId,
      commentId,
      generated.UpdatePostCommentRequest(text: text),
    ),
    PostComment.tryParse,
  );

  @override
  Future<ApiResult<void>> deleteComment(String postId, String commentId) =>
      _request(
        (api) => api.interactionsDeleteCommentWithHttpInfo(postId, commentId),
        (_) => true,
      );

  /// Sends one request and decodes a 200 or 201 body with [parse]; a 204 has
  /// no body.
  Future<ApiResult<T>> _request<T>(
    Future<http.Response> Function(generated.InteractionsApi api) send,
    Object? Function(Object? json) parse,
  ) async {
    final token = await _bearerToken();
    if (token == null) return const ApiError(Unauthenticated());

    final auth = generated.HttpBearerAuth()..accessToken = token;
    final client = generated.ApiClient(
      basePath: _baseUrl,
      authentication: auth,
    );
    if (_httpClient != null) client.client = _httpClient;

    final http.Response response;
    try {
      response = await send(generated.InteractionsApi(client));
    } on generated.ApiException catch (error) {
      return ApiError(failureForStatus(error.code, error.innerException));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }

    switch (response.statusCode) {
      case HttpStatus.noContent:
        return ApiSuccess(null as T);
      case HttpStatus.ok || HttpStatus.created:
        final Object? json;
        try {
          json = jsonDecode(response.body);
        } on FormatException {
          return const ApiError(ServiceUnavailable());
        }
        final value = parse(json);
        return value is T
            ? ApiSuccess(value)
            : const ApiError(ServiceUnavailable());
      case HttpStatus.notFound:
        return const ApiError(NotFound());
      case HttpStatus.conflict:
        return const ApiError(
          Conflict('That comment ID was already used for a different comment.'),
        );
      case HttpStatus.tooManyRequests:
        return const ApiError(RateLimited());
      case final status:
        return ApiError(failureForStatus(status, null));
    }
  }
}

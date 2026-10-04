//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class InteractionsApi {
  InteractionsApi([ApiClient? apiClient])
      : apiClient = apiClient ?? defaultApiClient;

  final ApiClient apiClient;

  /// Comment on a post
  ///
  /// Adds a comment, or a reply to a top-level comment, on a post the caller may read. Replies go one level deep. A retry with the same `clientCommentId` returns the comment already made with 200.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [CreatePostCommentRequest] createPostCommentRequest (required):
  Future<Response> interactionsCreateCommentWithHttpInfo(
    String postId,
    CreatePostCommentRequest createPostCommentRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts/{postId}/comments'
        .replaceAll('{postId}', postId.toString());

    // ignore: prefer_final_locals
    Object? postBody = createPostCommentRequest;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];

    return apiClient.invokeAPI(
      path,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// Comment on a post
  ///
  /// Adds a comment, or a reply to a top-level comment, on a post the caller may read. Replies go one level deep. A retry with the same `clientCommentId` returns the comment already made with 200.
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [CreatePostCommentRequest] createPostCommentRequest (required):
  Future<PostComment?> interactionsCreateComment(
    String postId,
    CreatePostCommentRequest createPostCommentRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await interactionsCreateCommentWithHttpInfo(
      postId,
      createPostCommentRequest,
      abortTrigger: abortTrigger,
    );
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty &&
        response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(
        await _decodeBodyBytes(response),
        'PostComment',
      ) as PostComment;
    }
    return null;
  }

  /// Delete a comment
  ///
  /// Lets the commenter, or the post's author, delete a comment. Deleting a top-level comment also hides its replies. Deleting a comment that is already deleted also returns 204.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [String] commentId (required):
  Future<Response> interactionsDeleteCommentWithHttpInfo(
    String postId,
    String commentId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts/{postId}/comments/{commentId}'
        .replaceAll('{postId}', postId.toString())
        .replaceAll('{commentId}', commentId.toString());

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];

    return apiClient.invokeAPI(
      path,
      'DELETE',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// Delete a comment
  ///
  /// Lets the commenter, or the post's author, delete a comment. Deleting a top-level comment also hides its replies. Deleting a comment that is already deleted also returns 204.
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [String] commentId (required):
  Future<void> interactionsDeleteComment(
    String postId,
    String commentId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await interactionsDeleteCommentWithHttpInfo(
      postId,
      commentId,
      abortTrigger: abortTrigger,
    );
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
  }

  /// Like a post
  ///
  /// Likes a post the caller may read, including their own. Liking a post already liked changes nothing, so retries are safe. Returns the like count and whether the caller likes it.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  Future<Response> interactionsLikeWithHttpInfo(
    String postId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts/{postId}/like'
        .replaceAll('{postId}', postId.toString());

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];

    return apiClient.invokeAPI(
      path,
      'PUT',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// Like a post
  ///
  /// Likes a post the caller may read, including their own. Liking a post already liked changes nothing, so retries are safe. Returns the like count and whether the caller likes it.
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  Future<PostLikeSummary?> interactionsLike(
    String postId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await interactionsLikeWithHttpInfo(
      postId,
      abortTrigger: abortTrigger,
    );
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty &&
        response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(
        await _decodeBodyBytes(response),
        'PostLikeSummary',
      ) as PostLikeSummary;
    }
    return null;
  }

  /// List the comments on a post
  ///
  /// Returns comments and replies on a post the caller may read, oldest first. Deleted comments, replies under a deleted comment, and comments by people across a block from the caller are left out. Each comment says whether the caller may edit or delete it.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<Response> interactionsListCommentsWithHttpInfo(
    String postId, {
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts/{postId}/comments'
        .replaceAll('{postId}', postId.toString());

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    if (cursor != null) {
      queryParams.addAll(_queryParams('', 'cursor', cursor));
    }
    if (limit != null) {
      queryParams.addAll(_queryParams('', 'limit', limit));
    }

    const contentTypes = <String>[];

    return apiClient.invokeAPI(
      path,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// List the comments on a post
  ///
  /// Returns comments and replies on a post the caller may read, oldest first. Deleted comments, replies under a deleted comment, and comments by people across a block from the caller are left out. Each comment says whether the caller may edit or delete it.
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<PostCommentsPage?> interactionsListComments(
    String postId, {
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    final response = await interactionsListCommentsWithHttpInfo(
      postId,
      cursor: cursor,
      limit: limit,
      abortTrigger: abortTrigger,
    );
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty &&
        response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(
        await _decodeBodyBytes(response),
        'PostCommentsPage',
      ) as PostCommentsPage;
    }
    return null;
  }

  /// List who liked a post
  ///
  /// Returns the people who liked a post the caller may read, newest first. People the caller has blocked, or who blocked the caller, are left out.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<Response> interactionsListLikesWithHttpInfo(
    String postId, {
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts/{postId}/likes'
        .replaceAll('{postId}', postId.toString());

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    if (cursor != null) {
      queryParams.addAll(_queryParams('', 'cursor', cursor));
    }
    if (limit != null) {
      queryParams.addAll(_queryParams('', 'limit', limit));
    }

    const contentTypes = <String>[];

    return apiClient.invokeAPI(
      path,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// List who liked a post
  ///
  /// Returns the people who liked a post the caller may read, newest first. People the caller has blocked, or who blocked the caller, are left out.
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<PostLikesPage?> interactionsListLikes(
    String postId, {
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    final response = await interactionsListLikesWithHttpInfo(
      postId,
      cursor: cursor,
      limit: limit,
      abortTrigger: abortTrigger,
    );
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty &&
        response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(
        await _decodeBodyBytes(response),
        'PostLikesPage',
      ) as PostLikesPage;
    }
    return null;
  }

  /// Unlike a post
  ///
  /// Removes the caller's like from a post they may read. Unliking a post that isn't liked changes nothing, so retries are safe. Returns the like count and whether the caller likes it.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  Future<Response> interactionsUnlikeWithHttpInfo(
    String postId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts/{postId}/like'
        .replaceAll('{postId}', postId.toString());

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];

    return apiClient.invokeAPI(
      path,
      'DELETE',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// Unlike a post
  ///
  /// Removes the caller's like from a post they may read. Unliking a post that isn't liked changes nothing, so retries are safe. Returns the like count and whether the caller likes it.
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  Future<PostLikeSummary?> interactionsUnlike(
    String postId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await interactionsUnlikeWithHttpInfo(
      postId,
      abortTrigger: abortTrigger,
    );
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty &&
        response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(
        await _decodeBodyBytes(response),
        'PostLikeSummary',
      ) as PostLikeSummary;
    }
    return null;
  }

  /// Edit a comment
  ///
  /// Lets the commenter change their comment while they can still read the post. The comment is then marked edited. Anyone else's comment returns 404.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [String] commentId (required):
  ///
  /// * [UpdatePostCommentRequest] updatePostCommentRequest (required):
  Future<Response> interactionsUpdateCommentWithHttpInfo(
    String postId,
    String commentId,
    UpdatePostCommentRequest updatePostCommentRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts/{postId}/comments/{commentId}'
        .replaceAll('{postId}', postId.toString())
        .replaceAll('{commentId}', commentId.toString());

    // ignore: prefer_final_locals
    Object? postBody = updatePostCommentRequest;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];

    return apiClient.invokeAPI(
      path,
      'PATCH',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// Edit a comment
  ///
  /// Lets the commenter change their comment while they can still read the post. The comment is then marked edited. Anyone else's comment returns 404.
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [String] commentId (required):
  ///
  /// * [UpdatePostCommentRequest] updatePostCommentRequest (required):
  Future<PostComment?> interactionsUpdateComment(
    String postId,
    String commentId,
    UpdatePostCommentRequest updatePostCommentRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await interactionsUpdateCommentWithHttpInfo(
      postId,
      commentId,
      updatePostCommentRequest,
      abortTrigger: abortTrigger,
    );
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty &&
        response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(
        await _decodeBodyBytes(response),
        'PostComment',
      ) as PostComment;
    }
    return null;
  }
}

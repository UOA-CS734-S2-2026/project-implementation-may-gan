//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class PostsApi {
  PostsApi([ApiClient? apiClient]) : apiClient = apiClient ?? defaultApiClient;

  final ApiClient apiClient;

  /// Submit today's daily post
  ///
  /// Creates the authenticated user's one post for the current Auckland day. Retry a lost response with the same `Idempotency-Key`: an identical retry returns the original post with `Idempotent-Replayed: true`, even after the deadline, while a changed request conflicts.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] idempotencyKey (required):
  ///   A client-generated key reused for every retry of this submission, such as a UUID stored with the draft.
  ///
  /// * [CreateDailyPostRequest] createDailyPostRequest (required):
  Future<Response> postsCreateWithHttpInfo(
    String idempotencyKey,
    CreateDailyPostRequest createDailyPostRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts';

    // ignore: prefer_final_locals
    Object? postBody = createDailyPostRequest;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    headerParams[r'idempotency-key'] = parameterToString(idempotencyKey);

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

  /// Submit today's daily post
  ///
  /// Creates the authenticated user's one post for the current Auckland day. Retry a lost response with the same `Idempotency-Key`: an identical retry returns the original post with `Idempotent-Replayed: true`, even after the deadline, while a changed request conflicts.
  ///
  /// Parameters:
  ///
  /// * [String] idempotencyKey (required):
  ///   A client-generated key reused for every retry of this submission, such as a UUID stored with the draft.
  ///
  /// * [CreateDailyPostRequest] createDailyPostRequest (required):
  Future<DailyPost?> postsCreate(
    String idempotencyKey,
    CreateDailyPostRequest createDailyPostRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await postsCreateWithHttpInfo(
      idempotencyKey,
      createDailyPostRequest,
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
        'DailyPost',
      ) as DailyPost;
    }
    return null;
  }

  /// Read one post
  ///
  /// Returns a post the caller may read. Authors can read their own solo and unreleased posts. Anyone else needs a released `friends` post by an active friend with no block in either direction. A missing post and a post the caller may not read both return 404.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  Future<Response> postsGetWithHttpInfo(
    String postId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/posts/{postId}'.replaceAll('{postId}', postId.toString());

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

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

  /// Read one post
  ///
  /// Returns a post the caller may read. Authors can read their own solo and unreleased posts. Anyone else needs a released `friends` post by an active friend with no block in either direction. A missing post and a post the caller may not read both return 404.
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  Future<PostDetail?> postsGet(
    String postId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await postsGetWithHttpInfo(
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
        'PostDetail',
      ) as PostDetail;
    }
    return null;
  }

  /// Get a fresh download URL for one attached photo or video
  ///
  /// Returns a new private download URL, valid for 5 minutes, when an earlier one has expired. The same rules as reading the post apply, and the media must still be attached to it.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [String] mediaId (required):
  Future<Response> postsGetMediaWithHttpInfo(
    String postId,
    String mediaId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts/{postId}/media/{mediaId}'
        .replaceAll('{postId}', postId.toString())
        .replaceAll('{mediaId}', mediaId.toString());

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

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

  /// Get a fresh download URL for one attached photo or video
  ///
  /// Returns a new private download URL, valid for 5 minutes, when an earlier one has expired. The same rules as reading the post apply, and the media must still be attached to it.
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [String] mediaId (required):
  Future<PostMedia?> postsGetMedia(
    String postId,
    String mediaId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await postsGetMediaWithHttpInfo(
      postId,
      mediaId,
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
        'PostMedia',
      ) as PostMedia;
    }
    return null;
  }

  /// Get a fresh download URL for a post's voice memo
  ///
  /// Returns a new private download URL, valid for 5 minutes, when an earlier one has expired. The same rules as reading the post apply, and the voice memo must still be attached to it.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  Future<Response> postsGetVoiceMemoWithHttpInfo(
    String postId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts/{postId}/voice-memo'
        .replaceAll('{postId}', postId.toString());

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

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

  /// Get a fresh download URL for a post's voice memo
  ///
  /// Returns a new private download URL, valid for 5 minutes, when an earlier one has expired. The same rules as reading the post apply, and the voice memo must still be attached to it.
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  Future<PostVoiceMemo?> postsGetVoiceMemo(
    String postId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await postsGetVoiceMemoWithHttpInfo(
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
        'PostVoiceMemo',
      ) as PostVoiceMemo;
    }
    return null;
  }

  /// List yesterday's posts from friends
  ///
  /// Returns yesterday's `friends` posts by the authenticated user's active friends: the Auckland day released at the most recent midnight. Earlier days are on each friend's profile. Solo posts, the caller's own posts, and posts by blocked or blocking users are never included. Access is re-checked on every page.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<Response> postsListFeedWithHttpInfo({
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/feed';

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

  /// List yesterday's posts from friends
  ///
  /// Returns yesterday's `friends` posts by the authenticated user's active friends: the Auckland day released at the most recent midnight. Earlier days are on each friend's profile. Solo posts, the caller's own posts, and posts by blocked or blocking users are never included. Access is re-checked on every page.
  ///
  /// Parameters:
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<FeedPage?> postsListFeed({
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    final response = await postsListFeedWithHttpInfo(
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
        'FeedPage',
      ) as FeedPage;
    }
    return null;
  }

  /// List the posts on a profile
  ///
  /// Returns one person's posts, newest Auckland day first. On the caller's own profile this includes solo and unreleased posts. On anyone else's it includes only released `friends` posts, and only while the two are active friends; otherwise the page is empty. Access is re-checked on every page. Unknown, banned and blocked profiles all return 404.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] username (required):
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<Response> postsListProfilePostsWithHttpInfo(
    String username, {
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/profiles/{username}/posts'.replaceAll('{username}', username);

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

  /// List the posts on a profile
  ///
  /// Returns one person's posts, newest Auckland day first. On the caller's own profile this includes solo and unreleased posts. On anyone else's it includes only released `friends` posts, and only while the two are active friends; otherwise the page is empty. Access is re-checked on every page. Unknown, banned and blocked profiles all return 404.
  ///
  /// Parameters:
  ///
  /// * [String] username (required):
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<ProfilePostsPage?> postsListProfilePosts(
    String username, {
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    final response = await postsListProfilePostsWithHttpInfo(
      username,
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
        'ProfilePostsPage',
      ) as ProfilePostsPage;
    }
    return null;
  }

  /// List a post's earlier versions
  ///
  /// Returns earlier versions of a post the caller may read, newest first. The author sees every version. Anyone else sees only versions that were already shared with friends, so text written while the post was solo stays private. A missing post and a post the caller may not read both return 404.
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
  Future<Response> postsListRevisionsWithHttpInfo(
    String postId, {
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts/{postId}/revisions'
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

  /// List a post's earlier versions
  ///
  /// Returns earlier versions of a post the caller may read, newest first. The author sees every version. Anyone else sees only versions that were already shared with friends, so text written while the post was solo stays private. A missing post and a post the caller may not read both return 404.
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<PostRevisionsPage?> postsListRevisions(
    String postId, {
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    final response = await postsListRevisionsWithHttpInfo(
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
        'PostRevisionsPage',
      ) as PostRevisionsPage;
    }
    return null;
  }

  /// List the authenticated owner's trashed posts
  ///
  /// Note: This method returns the HTTP [Response].
  Future<Response> postsListTrashWithHttpInfo({
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts/trash';

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

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

  /// List the authenticated owner's trashed posts
  Future<PostsListTrash200Response?> postsListTrash({
    Future<void>? abortTrigger,
  }) async {
    final response = await postsListTrashWithHttpInfo(
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
        'PostsListTrash200Response',
      ) as PostsListTrash200Response;
    }
    return null;
  }

  /// Restore an owned post from Trash
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  Future<Response> postsRestoreWithHttpInfo(
    String postId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/posts/{postId}/restore'.replaceAll('{postId}', postId);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];

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

  /// Restore an owned post from Trash
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  Future<PostsRestore200Response?> postsRestore(
    String postId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await postsRestoreWithHttpInfo(
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
        'PostsRestore200Response',
      ) as PostsRestore200Response;
    }
    return null;
  }

  /// Move an owned post to Trash
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  Future<Response> postsTrashWithHttpInfo(
    String postId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/posts/{postId}/trash'.replaceAll('{postId}', postId);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];

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

  /// Move an owned post to Trash
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  Future<TrashedPostStatus?> postsTrash(
    String postId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await postsTrashWithHttpInfo(
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
        'TrashedPostStatus',
      ) as TrashedPostStatus;
    }
    return null;
  }

  /// Edit a post
  ///
  /// Lets the author change the reflective answer, caption, rating, and audience of their post, before or after release. The request carries all four, and only values that differ are saved. Each saved edit keeps the previous version as a revision. Send the `revisionCount` you last read as `expectedRevisionCount`; a 409 means another edit was saved first. Repeating an edit that is already saved returns the post without adding a revision.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [UpdatePostRequest] updatePostRequest (required):
  Future<Response> postsUpdateWithHttpInfo(
    String postId,
    UpdatePostRequest updatePostRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/posts/{postId}'.replaceAll('{postId}', postId.toString());

    // ignore: prefer_final_locals
    Object? postBody = updatePostRequest;

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

  /// Edit a post
  ///
  /// Lets the author change the reflective answer, caption, rating, and audience of their post, before or after release. The request carries all four, and only values that differ are saved. Each saved edit keeps the previous version as a revision. Send the `revisionCount` you last read as `expectedRevisionCount`; a 409 means another edit was saved first. Repeating an edit that is already saved returns the post without adding a revision.
  ///
  /// Parameters:
  ///
  /// * [String] postId (required):
  ///
  /// * [UpdatePostRequest] updatePostRequest (required):
  Future<PostDetail?> postsUpdate(
    String postId,
    UpdatePostRequest updatePostRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await postsUpdateWithHttpInfo(
      postId,
      updatePostRequest,
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
        'PostDetail',
      ) as PostDetail;
    }
    return null;
  }
}

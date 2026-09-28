//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class RelationshipsApi {
  RelationshipsApi([ApiClient? apiClient])
      : apiClient = apiClient ?? defaultApiClient;

  final ApiClient apiClient;

  /// Accept a pending relationship request
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] requestId (required):
  Future<Response> relationshipsAcceptRequestWithHttpInfo(
    String requestId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/relationships/requests/{requestId}/accept'
        .replaceAll('{requestId}', requestId);

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

  /// Accept a pending relationship request
  ///
  /// Parameters:
  ///
  /// * [String] requestId (required):
  Future<RelationshipStatus?> relationshipsAcceptRequest(
    String requestId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await relationshipsAcceptRequestWithHttpInfo(
      requestId,
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
        'RelationshipStatus',
      ) as RelationshipStatus;
    }
    return null;
  }

  /// Block a user
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] userId (required):
  Future<Response> relationshipsBlockWithHttpInfo(
    String userId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/relationships/{userId}/block'.replaceAll('{userId}', userId);

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

  /// Block a user
  ///
  /// Parameters:
  ///
  /// * [String] userId (required):
  Future<RelationshipStatus?> relationshipsBlock(
    String userId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await relationshipsBlockWithHttpInfo(
      userId,
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
        'RelationshipStatus',
      ) as RelationshipStatus;
    }
    return null;
  }

  /// Cancel a pending relationship request
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] requestId (required):
  Future<Response> relationshipsCancelRequestWithHttpInfo(
    String requestId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/relationships/requests/{requestId}/cancel'
        .replaceAll('{requestId}', requestId);

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

  /// Cancel a pending relationship request
  ///
  /// Parameters:
  ///
  /// * [String] requestId (required):
  Future<RelationshipStatus?> relationshipsCancelRequest(
    String requestId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await relationshipsCancelRequestWithHttpInfo(
      requestId,
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
        'RelationshipStatus',
      ) as RelationshipStatus;
    }
    return null;
  }

  /// Decline a pending relationship request
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] requestId (required):
  Future<Response> relationshipsDeclineRequestWithHttpInfo(
    String requestId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/relationships/requests/{requestId}/decline'
        .replaceAll('{requestId}', requestId);

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

  /// Decline a pending relationship request
  ///
  /// Parameters:
  ///
  /// * [String] requestId (required):
  Future<RelationshipStatus?> relationshipsDeclineRequest(
    String requestId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await relationshipsDeclineRequestWithHttpInfo(
      requestId,
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
        'RelationshipStatus',
      ) as RelationshipStatus;
    }
    return null;
  }

  /// Get relationship status with a user
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] userId (required):
  Future<Response> relationshipsGetStatusWithHttpInfo(
    String userId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/relationships/{userId}'.replaceAll('{userId}', userId);

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

  /// Get relationship status with a user
  ///
  /// Parameters:
  ///
  /// * [String] userId (required):
  Future<RelationshipStatus?> relationshipsGetStatus(
    String userId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await relationshipsGetStatusWithHttpInfo(
      userId,
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
        'RelationshipStatus',
      ) as RelationshipStatus;
    }
    return null;
  }

  /// List active friends
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<Response> relationshipsListFriendsWithHttpInfo({
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/relationships/friends';

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

  /// List active friends
  ///
  /// Parameters:
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<RelationshipUserPage?> relationshipsListFriends({
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    final response = await relationshipsListFriendsWithHttpInfo(
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
        'RelationshipUserPage',
      ) as RelationshipUserPage;
    }
    return null;
  }

  /// List pending relationship requests
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  ///
  /// * [String] direction:
  Future<Response> relationshipsListPendingRequestsWithHttpInfo({
    String? cursor,
    int? limit,
    String? direction,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/relationships/requests';

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
    if (direction != null) {
      queryParams.addAll(_queryParams('', 'direction', direction));
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

  /// List pending relationship requests
  ///
  /// Parameters:
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  ///
  /// * [String] direction:
  Future<PendingRequestPage?> relationshipsListPendingRequests({
    String? cursor,
    int? limit,
    String? direction,
    Future<void>? abortTrigger,
  }) async {
    final response = await relationshipsListPendingRequestsWithHttpInfo(
      cursor: cursor,
      limit: limit,
      direction: direction,
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
        'PendingRequestPage',
      ) as PendingRequestPage;
    }
    return null;
  }

  /// End an active friendship
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] userId (required):
  Future<Response> relationshipsRemoveFriendshipWithHttpInfo(
    String userId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/relationships/{userId}/friendship'
        .replaceAll('{userId}', userId);

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

  /// End an active friendship
  ///
  /// Parameters:
  ///
  /// * [String] userId (required):
  Future<RelationshipStatus?> relationshipsRemoveFriendship(
    String userId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await relationshipsRemoveFriendshipWithHttpInfo(
      userId,
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
        'RelationshipStatus',
      ) as RelationshipStatus;
    }
    return null;
  }

  /// Search username prefixes
  ///
  /// Private accounts are discoverable here only as a minimal username/display-name card. This does not grant profile access.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] q (required):
  ///   Case-insensitive username prefix. Username setup is required for discovery.
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<Response> relationshipsSearchUsersWithHttpInfo(
    String q, {
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/relationships/search';

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
    queryParams.addAll(_queryParams('', 'q', q));

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

  /// Search username prefixes
  ///
  /// Private accounts are discoverable here only as a minimal username/display-name card. This does not grant profile access.
  ///
  /// Parameters:
  ///
  /// * [String] q (required):
  ///   Case-insensitive username prefix. Username setup is required for discovery.
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<RelationshipUserPage?> relationshipsSearchUsers(
    String q, {
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    final response = await relationshipsSearchUsersWithHttpInfo(
      q,
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
        'RelationshipUserPage',
      ) as RelationshipUserPage;
    }
    return null;
  }

  /// Send a relationship request
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [SendRelationshipRequest] sendRelationshipRequest:
  Future<Response> relationshipsSendRequestWithHttpInfo({
    SendRelationshipRequest? sendRelationshipRequest,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/relationships/requests';

    // ignore: prefer_final_locals
    Object? postBody = sendRelationshipRequest;

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

  /// Send a relationship request
  ///
  /// Parameters:
  ///
  /// * [SendRelationshipRequest] sendRelationshipRequest:
  Future<RelationshipStatus?> relationshipsSendRequest({
    SendRelationshipRequest? sendRelationshipRequest,
    Future<void>? abortTrigger,
  }) async {
    final response = await relationshipsSendRequestWithHttpInfo(
      sendRelationshipRequest: sendRelationshipRequest,
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
        'RelationshipStatus',
      ) as RelationshipStatus;
    }
    return null;
  }

  /// Unblock a user
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] userId (required):
  Future<Response> relationshipsUnblockWithHttpInfo(
    String userId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/relationships/{userId}/block'.replaceAll('{userId}', userId);

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

  /// Unblock a user
  ///
  /// Parameters:
  ///
  /// * [String] userId (required):
  Future<RelationshipStatus?> relationshipsUnblock(
    String userId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await relationshipsUnblockWithHttpInfo(
      userId,
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
        'RelationshipStatus',
      ) as RelationshipStatus;
    }
    return null;
  }
}

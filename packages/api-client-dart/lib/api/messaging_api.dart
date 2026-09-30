//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class MessagingApi {
  MessagingApi([ApiClient? apiClient])
      : apiClient = apiClient ?? defaultApiClient;

  final ApiClient apiClient;

  /// Performs an HTTP 'POST /api/v1/conversations/direct' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [CreateDirectConversationRequest] createDirectConversationRequest (required):
  Future<Response> createDirectConversationWithHttpInfo(
    CreateDirectConversationRequest createDirectConversationRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/conversations/direct';

    // ignore: prefer_final_locals
    Object? postBody = createDirectConversationRequest;

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

  /// Parameters:
  ///
  /// * [CreateDirectConversationRequest] createDirectConversationRequest (required):
  Future<CreateDirectConversation200Response?> createDirectConversation(
    CreateDirectConversationRequest createDirectConversationRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await createDirectConversationWithHttpInfo(
      createDirectConversationRequest,
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
        'CreateDirectConversation200Response',
      ) as CreateDirectConversation200Response;
    }
    return null;
  }

  /// Performs an HTTP 'POST /api/v1/realtime/tickets' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [Map<String, Object?>] requestBody (required):
  Future<Response> createRealtimeTicketWithHttpInfo(
    Map<String, Object?> requestBody, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/realtime/tickets';

    // ignore: prefer_final_locals
    Object? postBody = requestBody;

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

  /// Parameters:
  ///
  /// * [Map<String, Object?>] requestBody (required):
  Future<CreateRealtimeTicket201Response?> createRealtimeTicket(
    Map<String, Object?> requestBody, {
    Future<void>? abortTrigger,
  }) async {
    final response = await createRealtimeTicketWithHttpInfo(
      requestBody,
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
        'CreateRealtimeTicket201Response',
      ) as CreateRealtimeTicket201Response;
    }
    return null;
  }

  /// Performs an HTTP 'PATCH /api/v1/conversations/{conversationId}/messages/{messageId}' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] messageId (required):
  ///
  /// * [EditMessageRequest] editMessageRequest (required):
  Future<Response> editMessageWithHttpInfo(
    String conversationId,
    String messageId,
    EditMessageRequest editMessageRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/conversations/{conversationId}/messages/{messageId}'
        .replaceAll('{conversationId}', conversationId)
        .replaceAll('{messageId}', messageId);

    // ignore: prefer_final_locals
    Object? postBody = editMessageRequest;

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

  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] messageId (required):
  ///
  /// * [EditMessageRequest] editMessageRequest (required):
  Future<Message?> editMessage(
    String conversationId,
    String messageId,
    EditMessageRequest editMessageRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await editMessageWithHttpInfo(
      conversationId,
      messageId,
      editMessageRequest,
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
        'Message',
      ) as Message;
    }
    return null;
  }

  /// Performs an HTTP 'GET /api/v1/conversations/direct/{recipientId}' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] recipientId (required):
  Future<Response> findDirectConversationWithHttpInfo(
    String recipientId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/conversations/direct/{recipientId}'
        .replaceAll('{recipientId}', recipientId);

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

  /// Parameters:
  ///
  /// * [String] recipientId (required):
  Future<DirectPairLookup?> findDirectConversation(
    String recipientId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await findDirectConversationWithHttpInfo(
      recipientId,
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
        'DirectPairLookup',
      ) as DirectPairLookup;
    }
    return null;
  }

  /// Performs an HTTP 'GET /api/v1/conversations/{conversationId}' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] conversationId (required):
  Future<Response> getConversationWithHttpInfo(
    String conversationId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/conversations/{conversationId}'
        .replaceAll('{conversationId}', conversationId);

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

  /// Parameters:
  ///
  /// * [String] conversationId (required):
  Future<Conversation?> getConversation(
    String conversationId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await getConversationWithHttpInfo(
      conversationId,
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
        'Conversation',
      ) as Conversation;
    }
    return null;
  }

  /// Performs an HTTP 'GET /api/v1/conversations/{conversationId}/messages/{messageId}' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] messageId (required):
  Future<Response> getMessageWithHttpInfo(
    String conversationId,
    String messageId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/conversations/{conversationId}/messages/{messageId}'
        .replaceAll('{conversationId}', conversationId)
        .replaceAll('{messageId}', messageId);

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

  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] messageId (required):
  Future<Message?> getMessage(
    String conversationId,
    String messageId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await getMessageWithHttpInfo(
      conversationId,
      messageId,
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
        'Message',
      ) as Message;
    }
    return null;
  }

  /// Performs an HTTP 'GET /api/v1/messaging/unread' operation and returns the [Response].
  Future<Response> getMessagingUnreadWithHttpInfo({
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/messaging/unread';

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

  Future<GetMessagingUnread200Response?> getMessagingUnread({
    Future<void>? abortTrigger,
  }) async {
    final response = await getMessagingUnreadWithHttpInfo(
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
        'GetMessagingUnread200Response',
      ) as GetMessagingUnread200Response;
    }
    return null;
  }

  /// Performs an HTTP 'GET /api/v1/conversations/{conversationId}/changes' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] afterChangeSequence:
  ///
  /// * [int] limit:
  Future<Response> listConversationChangesWithHttpInfo(
    String conversationId, {
    String? afterChangeSequence,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/conversations/{conversationId}/changes'
        .replaceAll('{conversationId}', conversationId);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    if (afterChangeSequence != null) {
      queryParams
          .addAll(_queryParams('', 'afterChangeSequence', afterChangeSequence));
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

  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] afterChangeSequence:
  ///
  /// * [int] limit:
  Future<ListConversationChanges200Response?> listConversationChanges(
    String conversationId, {
    String? afterChangeSequence,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    final response = await listConversationChangesWithHttpInfo(
      conversationId,
      afterChangeSequence: afterChangeSequence,
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
        'ListConversationChanges200Response',
      ) as ListConversationChanges200Response;
    }
    return null;
  }

  /// Performs an HTTP 'GET /api/v1/conversations' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] folder:
  ///
  /// * [String] cursor:
  ///
  /// * [int] limit:
  Future<Response> listConversationsWithHttpInfo({
    String? folder,
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/conversations';

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    if (folder != null) {
      queryParams.addAll(_queryParams('', 'folder', folder));
    }
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

  /// Parameters:
  ///
  /// * [String] folder:
  ///
  /// * [String] cursor:
  ///
  /// * [int] limit:
  Future<ListConversations200Response?> listConversations({
    String? folder,
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    final response = await listConversationsWithHttpInfo(
      folder: folder,
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
        'ListConversations200Response',
      ) as ListConversations200Response;
    }
    return null;
  }

  /// Performs an HTTP 'GET /api/v1/conversations/{conversationId}/messages' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] beforeSequence:
  ///
  /// * [String] afterSequence:
  ///
  /// * [int] limit:
  Future<Response> listMessagesWithHttpInfo(
    String conversationId, {
    String? beforeSequence,
    String? afterSequence,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/conversations/{conversationId}/messages'
        .replaceAll('{conversationId}', conversationId);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    if (beforeSequence != null) {
      queryParams.addAll(_queryParams('', 'beforeSequence', beforeSequence));
    }
    if (afterSequence != null) {
      queryParams.addAll(_queryParams('', 'afterSequence', afterSequence));
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

  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] beforeSequence:
  ///
  /// * [String] afterSequence:
  ///
  /// * [int] limit:
  Future<ListMessages200Response?> listMessages(
    String conversationId, {
    String? beforeSequence,
    String? afterSequence,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    final response = await listMessagesWithHttpInfo(
      conversationId,
      beforeSequence: beforeSequence,
      afterSequence: afterSequence,
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
        'ListMessages200Response',
      ) as ListMessages200Response;
    }
    return null;
  }

  /// Performs an HTTP 'PUT /api/v1/conversations/{conversationId}/read' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [MarkConversationReadRequest] markConversationReadRequest (required):
  Future<Response> markConversationReadWithHttpInfo(
    String conversationId,
    MarkConversationReadRequest markConversationReadRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/conversations/{conversationId}/read'
        .replaceAll('{conversationId}', conversationId);

    // ignore: prefer_final_locals
    Object? postBody = markConversationReadRequest;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];

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

  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [MarkConversationReadRequest] markConversationReadRequest (required):
  Future<MarkConversationRead200Response?> markConversationRead(
    String conversationId,
    MarkConversationReadRequest markConversationReadRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await markConversationReadWithHttpInfo(
      conversationId,
      markConversationReadRequest,
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
        'MarkConversationRead200Response',
      ) as MarkConversationRead200Response;
    }
    return null;
  }

  /// Performs an HTTP 'PUT /api/v1/push/devices/{installationId}' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] installationId (required):
  ///
  /// * [RegisterPushDeviceRequest] registerPushDeviceRequest (required):
  Future<Response> registerPushDeviceWithHttpInfo(
    String installationId,
    RegisterPushDeviceRequest registerPushDeviceRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/push/devices/{installationId}'
        .replaceAll('{installationId}', installationId);

    // ignore: prefer_final_locals
    Object? postBody = registerPushDeviceRequest;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];

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

  /// Parameters:
  ///
  /// * [String] installationId (required):
  ///
  /// * [RegisterPushDeviceRequest] registerPushDeviceRequest (required):
  Future<void> registerPushDevice(
    String installationId,
    RegisterPushDeviceRequest registerPushDeviceRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await registerPushDeviceWithHttpInfo(
      installationId,
      registerPushDeviceRequest,
      abortTrigger: abortTrigger,
    );
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
  }

  /// Performs an HTTP 'DELETE /api/v1/conversations/{conversationId}/messages/{messageId}/reaction' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] messageId (required):
  Future<Response> removeMessageReactionWithHttpInfo(
    String conversationId,
    String messageId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/conversations/{conversationId}/messages/{messageId}/reaction'
            .replaceAll('{conversationId}', conversationId)
            .replaceAll('{messageId}', messageId);

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

  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] messageId (required):
  Future<Message?> removeMessageReaction(
    String conversationId,
    String messageId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await removeMessageReactionWithHttpInfo(
      conversationId,
      messageId,
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
        'Message',
      ) as Message;
    }
    return null;
  }

  /// Performs an HTTP 'PUT /api/v1/conversations/{conversationId}/request' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [ResolveMessageRequestRequest] resolveMessageRequestRequest (required):
  Future<Response> resolveMessageRequestWithHttpInfo(
    String conversationId,
    ResolveMessageRequestRequest resolveMessageRequestRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/conversations/{conversationId}/request'
        .replaceAll('{conversationId}', conversationId);

    // ignore: prefer_final_locals
    Object? postBody = resolveMessageRequestRequest;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];

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

  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [ResolveMessageRequestRequest] resolveMessageRequestRequest (required):
  Future<Conversation?> resolveMessageRequest(
    String conversationId,
    ResolveMessageRequestRequest resolveMessageRequestRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await resolveMessageRequestWithHttpInfo(
      conversationId,
      resolveMessageRequestRequest,
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
        'Conversation',
      ) as Conversation;
    }
    return null;
  }

  /// Performs an HTTP 'POST /api/v1/conversations/{conversationId}/messages' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [SendMessageRequest] sendMessageRequest (required):
  Future<Response> sendMessageWithHttpInfo(
    String conversationId,
    SendMessageRequest sendMessageRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/conversations/{conversationId}/messages'
        .replaceAll('{conversationId}', conversationId);

    // ignore: prefer_final_locals
    Object? postBody = sendMessageRequest;

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

  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [SendMessageRequest] sendMessageRequest (required):
  Future<Message?> sendMessage(
    String conversationId,
    SendMessageRequest sendMessageRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await sendMessageWithHttpInfo(
      conversationId,
      sendMessageRequest,
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
        'Message',
      ) as Message;
    }
    return null;
  }

  /// Performs an HTTP 'PUT /api/v1/conversations/{conversationId}/messages/{messageId}/reaction' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] messageId (required):
  ///
  /// * [SetMessageReactionRequest] setMessageReactionRequest (required):
  Future<Response> setMessageReactionWithHttpInfo(
    String conversationId,
    String messageId,
    SetMessageReactionRequest setMessageReactionRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/conversations/{conversationId}/messages/{messageId}/reaction'
            .replaceAll('{conversationId}', conversationId)
            .replaceAll('{messageId}', messageId);

    // ignore: prefer_final_locals
    Object? postBody = setMessageReactionRequest;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];

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

  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] messageId (required):
  ///
  /// * [SetMessageReactionRequest] setMessageReactionRequest (required):
  Future<Message?> setMessageReaction(
    String conversationId,
    String messageId,
    SetMessageReactionRequest setMessageReactionRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await setMessageReactionWithHttpInfo(
      conversationId,
      messageId,
      setMessageReactionRequest,
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
        'Message',
      ) as Message;
    }
    return null;
  }

  /// Performs an HTTP 'DELETE /api/v1/push/devices/{installationId}' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] installationId (required):
  Future<Response> unregisterPushDeviceWithHttpInfo(
    String installationId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/push/devices/{installationId}'
        .replaceAll('{installationId}', installationId);

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

  /// Parameters:
  ///
  /// * [String] installationId (required):
  Future<void> unregisterPushDevice(
    String installationId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await unregisterPushDeviceWithHttpInfo(
      installationId,
      abortTrigger: abortTrigger,
    );
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
  }

  /// Performs an HTTP 'DELETE /api/v1/conversations/{conversationId}/messages/{messageId}' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] messageId (required):
  Future<Response> unsendMessageWithHttpInfo(
    String conversationId,
    String messageId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/conversations/{conversationId}/messages/{messageId}'
        .replaceAll('{conversationId}', conversationId)
        .replaceAll('{messageId}', messageId);

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

  /// Parameters:
  ///
  /// * [String] conversationId (required):
  ///
  /// * [String] messageId (required):
  Future<Message?> unsendMessage(
    String conversationId,
    String messageId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await unsendMessageWithHttpInfo(
      conversationId,
      messageId,
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
        'Message',
      ) as Message;
    }
    return null;
  }
}

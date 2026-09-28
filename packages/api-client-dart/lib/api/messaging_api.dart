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

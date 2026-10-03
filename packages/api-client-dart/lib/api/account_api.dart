//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AccountApi {
  AccountApi([ApiClient? apiClient])
      : apiClient = apiClient ?? defaultApiClient;

  final ApiClient apiClient;

  /// Start browser Google verification for one account action
  ///
  /// A browser-only authorization-code flow. It does not sign in, link an account, or request deletion. The callback requires the original live session and a fresh signed Google authentication time.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [GoogleReauthenticationRequest] googleReauthenticationRequest (required):
  Future<Response> accountBeginGoogleReauthenticationWithHttpInfo(
    GoogleReauthenticationRequest googleReauthenticationRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/account/reauthenticate/google';

    // ignore: prefer_final_locals
    Object? postBody = googleReauthenticationRequest;

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

  /// Start browser Google verification for one account action
  ///
  /// A browser-only authorization-code flow. It does not sign in, link an account, or request deletion. The callback requires the original live session and a fresh signed Google authentication time.
  ///
  /// Parameters:
  ///
  /// * [GoogleReauthenticationRequest] googleReauthenticationRequest (required):
  Future<GoogleReauthenticationIntent?> accountBeginGoogleReauthentication(
    GoogleReauthenticationRequest googleReauthenticationRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await accountBeginGoogleReauthenticationWithHttpInfo(
      googleReauthenticationRequest,
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
        'GoogleReauthenticationIntent',
      ) as GoogleReauthenticationIntent;
    }
    return null;
  }

  /// Cancel a pending deletion after fresh action verification
  ///
  /// Uses the database cancellation deadline. Revoked sessions and push registrations are not restored.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [DeletionGrantRequest] deletionGrantRequest (required):
  Future<Response> accountCancelDeletionWithHttpInfo(
    DeletionGrantRequest deletionGrantRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/account/deletion/cancel';

    // ignore: prefer_final_locals
    Object? postBody = deletionGrantRequest;

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

  /// Cancel a pending deletion after fresh action verification
  ///
  /// Uses the database cancellation deadline. Revoked sessions and push registrations are not restored.
  ///
  /// Parameters:
  ///
  /// * [DeletionGrantRequest] deletionGrantRequest (required):
  Future<AccountDeletionCancellationResult?> accountCancelDeletion(
    DeletionGrantRequest deletionGrantRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await accountCancelDeletionWithHttpInfo(
      deletionGrantRequest,
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
        'AccountDeletionCancellationResult',
      ) as AccountDeletionCancellationResult;
    }
    return null;
  }

  /// Read the authenticated account's deletion status
  ///
  /// Content-free state and database-timed deadlines. An absent lifecycle record is active.
  ///
  /// Note: This method returns the HTTP [Response].
  Future<Response> accountGetDeletionStatusWithHttpInfo({
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/account/deletion';

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

  /// Read the authenticated account's deletion status
  ///
  /// Content-free state and database-timed deadlines. An absent lifecycle record is active.
  Future<AccountDeletionStatus?> accountGetDeletionStatus({
    Future<void>? abortTrigger,
  }) async {
    final response = await accountGetDeletionStatusWithHttpInfo(
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
        'AccountDeletionStatus',
      ) as AccountDeletionStatus;
    }
    return null;
  }

  /// Verify a password for one account management action
  ///
  /// Issues a session-bound, single-use five-minute grant. This does not request or cancel deletion. Google-only accounts require a separate verified Google action.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [PasswordReauthenticationRequest] passwordReauthenticationRequest (required):
  Future<Response> accountReauthenticatePasswordWithHttpInfo(
    PasswordReauthenticationRequest passwordReauthenticationRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/account/reauthenticate/password';

    // ignore: prefer_final_locals
    Object? postBody = passwordReauthenticationRequest;

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

  /// Verify a password for one account management action
  ///
  /// Issues a session-bound, single-use five-minute grant. This does not request or cancel deletion. Google-only accounts require a separate verified Google action.
  ///
  /// Parameters:
  ///
  /// * [PasswordReauthenticationRequest] passwordReauthenticationRequest (required):
  Future<PasswordReauthenticationGrant?> accountReauthenticatePassword(
    PasswordReauthenticationRequest passwordReauthenticationRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await accountReauthenticatePasswordWithHttpInfo(
      passwordReauthenticationRequest,
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
        'PasswordReauthenticationGrant',
      ) as PasswordReauthenticationGrant;
    }
    return null;
  }

  /// Request deletion after fresh action verification
  ///
  /// Requires a session-bound single-use grant and Idempotency-Key header. Production requests remain disabled until a separate activation decision. This operation does not physically purge content.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] idempotencyKey (required):
  ///
  /// * [DeletionGrantRequest] deletionGrantRequest (required):
  Future<Response> accountRequestDeletionWithHttpInfo(
    String idempotencyKey,
    DeletionGrantRequest deletionGrantRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/account/deletion/request';

    // ignore: prefer_final_locals
    Object? postBody = deletionGrantRequest;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    headerParams[r'Idempotency-Key'] = parameterToString(idempotencyKey);

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

  /// Request deletion after fresh action verification
  ///
  /// Requires a session-bound single-use grant and Idempotency-Key header. Production requests remain disabled until a separate activation decision. This operation does not physically purge content.
  ///
  /// Parameters:
  ///
  /// * [String] idempotencyKey (required):
  ///
  /// * [DeletionGrantRequest] deletionGrantRequest (required):
  Future<AccountDeletionRequestResult?> accountRequestDeletion(
    String idempotencyKey,
    DeletionGrantRequest deletionGrantRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await accountRequestDeletionWithHttpInfo(
      idempotencyKey,
      deletionGrantRequest,
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
        'AccountDeletionRequestResult',
      ) as AccountDeletionRequestResult;
    }
    return null;
  }
}

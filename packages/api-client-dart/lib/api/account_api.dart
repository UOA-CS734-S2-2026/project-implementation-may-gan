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

  /// Performs an HTTP 'POST /api/v1/account/reauthenticate/google/begin' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [AccountGoogleProofBeginRequest] accountGoogleProofBeginRequest:
  Future<Response> accountGoogleProofBeginWithHttpInfo({
    AccountGoogleProofBeginRequest? accountGoogleProofBeginRequest,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/account/reauthenticate/google/begin';

    // ignore: prefer_final_locals
    Object? postBody = accountGoogleProofBeginRequest;

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
  /// * [AccountGoogleProofBeginRequest] accountGoogleProofBeginRequest:
  Future<AccountGoogleProofBegin200Response?> accountGoogleProofBegin({
    AccountGoogleProofBeginRequest? accountGoogleProofBeginRequest,
    Future<void>? abortTrigger,
  }) async {
    final response = await accountGoogleProofBeginWithHttpInfo(
      accountGoogleProofBeginRequest: accountGoogleProofBeginRequest,
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
        'AccountGoogleProofBegin200Response',
      ) as AccountGoogleProofBegin200Response;
    }
    return null;
  }

  /// Performs an HTTP 'GET /api/v1/account/reauthenticate/google/callback' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [String] state (required):
  ///
  /// * [String] code:
  Future<Response> accountGoogleProofCallbackWithHttpInfo(
    String state, {
    String? code,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/account/reauthenticate/google/callback';

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    queryParams.addAll(_queryParams('', 'state', state));
    if (code != null) {
      queryParams.addAll(_queryParams('', 'code', code));
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
  /// * [String] state (required):
  ///
  /// * [String] code:
  Future<void> accountGoogleProofCallback(
    String state, {
    String? code,
    Future<void>? abortTrigger,
  }) async {
    final response = await accountGoogleProofCallbackWithHttpInfo(
      state,
      code: code,
      abortTrigger: abortTrigger,
    );
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
  }

  /// Performs an HTTP 'POST /api/v1/account/reauthenticate/google/complete' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [AccountGoogleProofCompleteRequest] accountGoogleProofCompleteRequest:
  Future<Response> accountGoogleProofCompleteWithHttpInfo({
    AccountGoogleProofCompleteRequest? accountGoogleProofCompleteRequest,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/account/reauthenticate/google/complete';

    // ignore: prefer_final_locals
    Object? postBody = accountGoogleProofCompleteRequest;

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
  /// * [AccountGoogleProofCompleteRequest] accountGoogleProofCompleteRequest:
  Future<AccountGoogleProofComplete200Response?> accountGoogleProofComplete({
    AccountGoogleProofCompleteRequest? accountGoogleProofCompleteRequest,
    Future<void>? abortTrigger,
  }) async {
    final response = await accountGoogleProofCompleteWithHttpInfo(
      accountGoogleProofCompleteRequest: accountGoogleProofCompleteRequest,
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
        'AccountGoogleProofComplete200Response',
      ) as AccountGoogleProofComplete200Response;
    }
    return null;
  }
}

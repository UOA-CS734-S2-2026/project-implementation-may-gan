//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class LegalApi {
  LegalApi([ApiClient? apiClient]) : apiClient = apiClient ?? defaultApiClient;

  final ApiClient apiClient;

  /// Performs an HTTP 'POST /api/v1/account/legal/acceptance' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [LegalAcceptCurrentTermsRequest] legalAcceptCurrentTermsRequest:
  Future<Response> legalAcceptCurrentTermsWithHttpInfo({
    LegalAcceptCurrentTermsRequest? legalAcceptCurrentTermsRequest,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/account/legal/acceptance';

    // ignore: prefer_final_locals
    Object? postBody = legalAcceptCurrentTermsRequest;

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
  /// * [LegalAcceptCurrentTermsRequest] legalAcceptCurrentTermsRequest:
  Future<LegalAcceptCurrentTerms200Response?> legalAcceptCurrentTerms({
    LegalAcceptCurrentTermsRequest? legalAcceptCurrentTermsRequest,
    Future<void>? abortTrigger,
  }) async {
    final response = await legalAcceptCurrentTermsWithHttpInfo(
      legalAcceptCurrentTermsRequest: legalAcceptCurrentTermsRequest,
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
        'LegalAcceptCurrentTerms200Response',
      ) as LegalAcceptCurrentTerms200Response;
    }
    return null;
  }

  /// Performs an HTTP 'GET /api/v1/legal/terms/current' operation and returns the [Response].
  Future<Response> legalGetCurrentTermsWithHttpInfo({
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/legal/terms/current';

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

  Future<LegalGetCurrentTerms200Response?> legalGetCurrentTerms({
    Future<void>? abortTrigger,
  }) async {
    final response = await legalGetCurrentTermsWithHttpInfo(
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
        'LegalGetCurrentTerms200Response',
      ) as LegalGetCurrentTerms200Response;
    }
    return null;
  }

  /// Performs an HTTP 'GET /api/v1/legal/terms/notice' operation and returns the [Response].
  Future<Response> legalGetTermsNoticeWithHttpInfo({
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/legal/terms/notice';

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

  Future<LegalGetTermsNotice200Response?> legalGetTermsNotice({
    Future<void>? abortTrigger,
  }) async {
    final response = await legalGetTermsNoticeWithHttpInfo(
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
        'LegalGetTermsNotice200Response',
      ) as LegalGetTermsNotice200Response;
    }
    return null;
  }

  /// Performs an HTTP 'POST /api/v1/legal/registration-intents' operation and returns the [Response].
  /// Parameters:
  ///
  /// * [LegalIssueRegistrationIntentRequest] legalIssueRegistrationIntentRequest:
  Future<Response> legalIssueRegistrationIntentWithHttpInfo({
    LegalIssueRegistrationIntentRequest? legalIssueRegistrationIntentRequest,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/legal/registration-intents';

    // ignore: prefer_final_locals
    Object? postBody = legalIssueRegistrationIntentRequest;

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
  /// * [LegalIssueRegistrationIntentRequest] legalIssueRegistrationIntentRequest:
  Future<LegalIssueRegistrationIntent201Response?>
      legalIssueRegistrationIntent({
    LegalIssueRegistrationIntentRequest? legalIssueRegistrationIntentRequest,
    Future<void>? abortTrigger,
  }) async {
    final response = await legalIssueRegistrationIntentWithHttpInfo(
      legalIssueRegistrationIntentRequest: legalIssueRegistrationIntentRequest,
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
        'LegalIssueRegistrationIntent201Response',
      ) as LegalIssueRegistrationIntent201Response;
    }
    return null;
  }
}

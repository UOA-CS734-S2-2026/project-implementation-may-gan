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

  /// Read current published signup Terms metadata
  ///
  /// Note: This method returns the HTTP [Response].
  Future<Response> legalCurrentRegistrationTermsWithHttpInfo({
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/legal/current';

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

  /// Read current published signup Terms metadata
  Future<CurrentLegalRegistrationTerms?> legalCurrentRegistrationTerms({
    Future<void>? abortTrigger,
  }) async {
    final response = await legalCurrentRegistrationTermsWithHttpInfo(
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
        'CurrentLegalRegistrationTerms',
      ) as CurrentLegalRegistrationTerms;
    }
    return null;
  }

  /// Start one explicit email or Google registration action
  ///
  /// Requires current approved documents and one affirmative Terms, Privacy notice, and 16+ action before account creation.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [RegistrationIntentRequest] registrationIntentRequest (required):
  Future<Response> legalIssueRegistrationIntentWithHttpInfo(
    RegistrationIntentRequest registrationIntentRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/legal/registration-intent';

    // ignore: prefer_final_locals
    Object? postBody = registrationIntentRequest;

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

  /// Start one explicit email or Google registration action
  ///
  /// Requires current approved documents and one affirmative Terms, Privacy notice, and 16+ action before account creation.
  ///
  /// Parameters:
  ///
  /// * [RegistrationIntentRequest] registrationIntentRequest (required):
  Future<RegistrationIntentResponse?> legalIssueRegistrationIntent(
    RegistrationIntentRequest registrationIntentRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await legalIssueRegistrationIntentWithHttpInfo(
      registrationIntentRequest,
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
        'RegistrationIntentResponse',
      ) as RegistrationIntentResponse;
    }
    return null;
  }

  /// Record an explicit current Terms and 16+ action
  ///
  /// Available only for an effective Terms version. The Privacy Policy is a notice, not consent. No draft document can be accepted.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [LegalAcceptanceRequest] legalAcceptanceRequest (required):
  Future<Response> legalRecordAcceptanceWithHttpInfo(
    LegalAcceptanceRequest legalAcceptanceRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/legal/acceptance';

    // ignore: prefer_final_locals
    Object? postBody = legalAcceptanceRequest;

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

  /// Record an explicit current Terms and 16+ action
  ///
  /// Available only for an effective Terms version. The Privacy Policy is a notice, not consent. No draft document can be accepted.
  ///
  /// Parameters:
  ///
  /// * [LegalAcceptanceRequest] legalAcceptanceRequest (required):
  Future<LegalAcceptanceResponse?> legalRecordAcceptance(
    LegalAcceptanceRequest legalAcceptanceRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await legalRecordAcceptanceWithHttpInfo(
      legalAcceptanceRequest,
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
        'LegalAcceptanceResponse',
      ) as LegalAcceptanceResponse;
    }
    return null;
  }
}

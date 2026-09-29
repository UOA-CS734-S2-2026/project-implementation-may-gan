//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ProfileApi {
  ProfileApi([ApiClient? apiClient])
      : apiClient = apiClient ?? defaultApiClient;

  final ApiClient apiClient;

  /// Claim an initial username
  ///
  /// Completes the one-time required username setup for the authenticated account. It never renames an established handle.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [UsernameSetupRequest] usernameSetupRequest (required):
  Future<Response> profileClaimInitialUsernameWithHttpInfo(
    UsernameSetupRequest usernameSetupRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/profile/username';

    // ignore: prefer_final_locals
    Object? postBody = usernameSetupRequest;

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

  /// Claim an initial username
  ///
  /// Completes the one-time required username setup for the authenticated account. It never renames an established handle.
  ///
  /// Parameters:
  ///
  /// * [UsernameSetupRequest] usernameSetupRequest (required):
  Future<UsernameProfile?> profileClaimInitialUsername(
    UsernameSetupRequest usernameSetupRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await profileClaimInitialUsernameWithHttpInfo(
      usernameSetupRequest,
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
        'UsernameProfile',
      ) as UsernameProfile;
    }
    return null;
  }

  /// Get username setup state
  ///
  /// Note: This method returns the HTTP [Response].
  Future<Response> profileGetUsernameWithHttpInfo({
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/profile/username';

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

  /// Get username setup state
  Future<UsernameProfile?> profileGetUsername({
    Future<void>? abortTrigger,
  }) async {
    final response = await profileGetUsernameWithHttpInfo(
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
        'UsernameProfile',
      ) as UsernameProfile;
    }
    return null;
  }
}

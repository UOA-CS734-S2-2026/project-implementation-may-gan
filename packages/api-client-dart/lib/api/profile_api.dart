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

  /// Change your username
  ///
  /// Changes an established username. It can change at most once every 30 days. The previous handle stays reserved for this account for 30 days, and profile links to it resolve to the new one. Choosing the current handle again changes nothing.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [ChangeUsernameRequest] changeUsernameRequest (required):
  Future<Response> profileChangeUsernameWithHttpInfo(
    ChangeUsernameRequest changeUsernameRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/profile/username';

    // ignore: prefer_final_locals
    Object? postBody = changeUsernameRequest;

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

  /// Change your username
  ///
  /// Changes an established username. It can change at most once every 30 days. The previous handle stays reserved for this account for 30 days, and profile links to it resolve to the new one. Choosing the current handle again changes nothing.
  ///
  /// Parameters:
  ///
  /// * [ChangeUsernameRequest] changeUsernameRequest (required):
  Future<ChangeUsernameResponse?> profileChangeUsername(
    ChangeUsernameRequest changeUsernameRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await profileChangeUsernameWithHttpInfo(
      changeUsernameRequest,
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
        'ChangeUsernameResponse',
      ) as ChangeUsernameResponse;
    }
    return null;
  }

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

  /// Read a profile's details
  ///
  /// Returns the public name and, when the caller may see it, the bio. The owner always sees their bio; anyone else sees it when the account is public or when they are active friends. The owner also gets their visibility and when their username can next change. A handle the owner gave up in the last 30 days resolves to their current profile. Unknown, banned and blocked profiles all return 404.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] username (required):
  Future<Response> profileGetDetailsWithHttpInfo(
    String username, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/profiles/{username}'.replaceAll('{username}', username);

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

  /// Read a profile's details
  ///
  /// Returns the public name and, when the caller may see it, the bio. The owner always sees their bio; anyone else sees it when the account is public or when they are active friends. The owner also gets their visibility and when their username can next change. A handle the owner gave up in the last 30 days resolves to their current profile. Unknown, banned and blocked profiles all return 404.
  ///
  /// Parameters:
  ///
  /// * [String] username (required):
  Future<ProfileDetails?> profileGetDetails(
    String username, {
    Future<void>? abortTrigger,
  }) async {
    final response = await profileGetDetailsWithHttpInfo(
      username,
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
        'ProfileDetails',
      ) as ProfileDetails;
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

  /// Remove your profile photo
  ///
  /// Removes the profile photo. Profiles then show the first letter of the name.
  ///
  /// Note: This method returns the HTTP [Response].
  Future<Response> profileRemoveAvatarWithHttpInfo({
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/profile/avatar';

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

  /// Remove your profile photo
  ///
  /// Removes the profile photo. Profiles then show the first letter of the name.
  Future<ProfileDetails?> profileRemoveAvatar({
    Future<void>? abortTrigger,
  }) async {
    final response = await profileRemoveAvatarWithHttpInfo(
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
        'ProfileDetails',
      ) as ProfileDetails;
    }
    return null;
  }

  /// Set your profile photo
  ///
  /// Uses one of your validated JPEG, PNG, or WebP uploads as your profile photo, replacing any previous one. Upload it first through the media reservation flow.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [SetAvatarRequest] setAvatarRequest (required):
  Future<Response> profileSetAvatarWithHttpInfo(
    SetAvatarRequest setAvatarRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/profile/avatar';

    // ignore: prefer_final_locals
    Object? postBody = setAvatarRequest;

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

  /// Set your profile photo
  ///
  /// Uses one of your validated JPEG, PNG, or WebP uploads as your profile photo, replacing any previous one. Upload it first through the media reservation flow.
  ///
  /// Parameters:
  ///
  /// * [SetAvatarRequest] setAvatarRequest (required):
  Future<ProfileDetails?> profileSetAvatar(
    SetAvatarRequest setAvatarRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await profileSetAvatarWithHttpInfo(
      setAvatarRequest,
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
        'ProfileDetails',
      ) as ProfileDetails;
    }
    return null;
  }

  /// Update your profile
  ///
  /// Changes any of the bio, public name, and profile visibility for the authenticated account. Fields left out are unchanged; null or blank text clears a field.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [UpdateProfileRequest] updateProfileRequest (required):
  Future<Response> profileUpdateWithHttpInfo(
    UpdateProfileRequest updateProfileRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/profile';

    // ignore: prefer_final_locals
    Object? postBody = updateProfileRequest;

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

  /// Update your profile
  ///
  /// Changes any of the bio, public name, and profile visibility for the authenticated account. Fields left out are unchanged; null or blank text clears a field.
  ///
  /// Parameters:
  ///
  /// * [UpdateProfileRequest] updateProfileRequest (required):
  Future<ProfileDetails?> profileUpdate(
    UpdateProfileRequest updateProfileRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await profileUpdateWithHttpInfo(
      updateProfileRequest,
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
        'ProfileDetails',
      ) as ProfileDetails;
    }
    return null;
  }
}

//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FutureSelfNotesApi {
  FutureSelfNotesApi([ApiClient? apiClient])
      : apiClient = apiClient ?? defaultApiClient;

  final ApiClient apiClient;

  /// Write a note to your future self
  ///
  /// Schedules an owner-only note for an Auckland date from tomorrow up to 10 years ahead. The note is not attached to a post. Its text is never readable, even by you, before that date. Retry a lost response with the same `Idempotency-Key`: an identical retry returns the original note with `Idempotent-Replayed: true`, while a changed request conflicts. Requires a chosen username.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] idempotencyKey (required):
  ///   A client-generated key reused for every retry of this note, such as a UUID stored with the draft.
  ///
  /// * [CreateFutureSelfNoteRequest] createFutureSelfNoteRequest (required):
  Future<Response> futureSelfNotesCreateWithHttpInfo(
    String idempotencyKey,
    CreateFutureSelfNoteRequest createFutureSelfNoteRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/future-self-notes';

    // ignore: prefer_final_locals
    Object? postBody = createFutureSelfNoteRequest;

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

  /// Write a note to your future self
  ///
  /// Schedules an owner-only note for an Auckland date from tomorrow up to 10 years ahead. The note is not attached to a post. Its text is never readable, even by you, before that date. Retry a lost response with the same `Idempotency-Key`: an identical retry returns the original note with `Idempotent-Replayed: true`, while a changed request conflicts. Requires a chosen username.
  ///
  /// Parameters:
  ///
  /// * [String] idempotencyKey (required):
  ///   A client-generated key reused for every retry of this note, such as a UUID stored with the draft.
  ///
  /// * [CreateFutureSelfNoteRequest] createFutureSelfNoteRequest (required):
  Future<FutureSelfNote?> futureSelfNotesCreate(
    String idempotencyKey,
    CreateFutureSelfNoteRequest createFutureSelfNoteRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await futureSelfNotesCreateWithHttpInfo(
      idempotencyKey,
      createFutureSelfNoteRequest,
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
        'FutureSelfNote',
      ) as FutureSelfNote;
    }
    return null;
  }

  /// Delete a future-self note
  ///
  /// Deletes the caller's own note, scheduled or delivered, together with any queued delivery. An unknown ID or someone else's note returns `404`.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] noteId (required):
  Future<Response> futureSelfNotesDeleteWithHttpInfo(
    String noteId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/future-self-notes/{noteId}'.replaceAll('{noteId}', noteId);

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

  /// Delete a future-self note
  ///
  /// Deletes the caller's own note, scheduled or delivered, together with any queued delivery. An unknown ID or someone else's note returns `404`.
  ///
  /// Parameters:
  ///
  /// * [String] noteId (required):
  Future<void> futureSelfNotesDelete(
    String noteId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await futureSelfNotesDeleteWithHttpInfo(
      noteId,
      abortTrigger: abortTrigger,
    );
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
  }

  /// Read a future-self note
  ///
  /// Returns the note's text to its owner from its Auckland delivery date onward, whether or not the delivery job has run. Before that date the response is `403` with `details.reason` `NOTE_NOT_YET_AVAILABLE` and no text. Anyone else, and an unknown ID, gets `404`.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] noteId (required):
  Future<Response> futureSelfNotesGetWithHttpInfo(
    String noteId, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/future-self-notes/{noteId}'.replaceAll('{noteId}', noteId);

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

  /// Read a future-self note
  ///
  /// Returns the note's text to its owner from its Auckland delivery date onward, whether or not the delivery job has run. Before that date the response is `403` with `details.reason` `NOTE_NOT_YET_AVAILABLE` and no text. Anyone else, and an unknown ID, gets `404`.
  ///
  /// Parameters:
  ///
  /// * [String] noteId (required):
  Future<FutureSelfNoteDetail?> futureSelfNotesGet(
    String noteId, {
    Future<void>? abortTrigger,
  }) async {
    final response = await futureSelfNotesGetWithHttpInfo(
      noteId,
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
        'FutureSelfNoteDetail',
      ) as FutureSelfNoteDetail;
    }
    return null;
  }

  /// List your future-self notes
  ///
  /// Returns the caller's own notes, soonest delivery date first. Each item shows that the note exists, its date and its status, but never its text: read one note to get its text once its date has arrived.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<Response> futureSelfNotesListWithHttpInfo({
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path = r'/api/v1/future-self-notes';

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

  /// List your future-self notes
  ///
  /// Returns the caller's own notes, soonest delivery date first. Each item shows that the note exists, its date and its status, but never its text: read one note to get its text once its date has arrived.
  ///
  /// Parameters:
  ///
  /// * [String] cursor:
  ///   Opaque continuation cursor
  ///
  /// * [int] limit:
  Future<FutureSelfNotePage?> futureSelfNotesList({
    String? cursor,
    int? limit,
    Future<void>? abortTrigger,
  }) async {
    final response = await futureSelfNotesListWithHttpInfo(
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
        'FutureSelfNotePage',
      ) as FutureSelfNotePage;
    }
    return null;
  }

  /// Edit a future-self note
  ///
  /// Changes the text, the delivery date, or both, until the note is delivered. A new date follows the create rules and replaces any delivery already queued for the old one. A delivered note returns `409` with `details.reason` `NOTE_ALREADY_DELIVERED`. The response never includes the text.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] noteId (required):
  ///
  /// * [UpdateFutureSelfNoteRequest] updateFutureSelfNoteRequest (required):
  Future<Response> futureSelfNotesUpdateWithHttpInfo(
    String noteId,
    UpdateFutureSelfNoteRequest updateFutureSelfNoteRequest, {
    Future<void>? abortTrigger,
  }) async {
    // ignore: prefer_const_declarations
    final path =
        r'/api/v1/future-self-notes/{noteId}'.replaceAll('{noteId}', noteId);

    // ignore: prefer_final_locals
    Object? postBody = updateFutureSelfNoteRequest;

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

  /// Edit a future-self note
  ///
  /// Changes the text, the delivery date, or both, until the note is delivered. A new date follows the create rules and replaces any delivery already queued for the old one. A delivered note returns `409` with `details.reason` `NOTE_ALREADY_DELIVERED`. The response never includes the text.
  ///
  /// Parameters:
  ///
  /// * [String] noteId (required):
  ///
  /// * [UpdateFutureSelfNoteRequest] updateFutureSelfNoteRequest (required):
  Future<FutureSelfNote?> futureSelfNotesUpdate(
    String noteId,
    UpdateFutureSelfNoteRequest updateFutureSelfNoteRequest, {
    Future<void>? abortTrigger,
  }) async {
    final response = await futureSelfNotesUpdateWithHttpInfo(
      noteId,
      updateFutureSelfNoteRequest,
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
        'FutureSelfNote',
      ) as FutureSelfNote;
    }
    return null;
  }
}

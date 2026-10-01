//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ApiClient {
  ApiClient({
    this.basePath = 'http://localhost',
    this.authentication,
  });

  final String basePath;
  final Authentication? authentication;

  var _client = Client();
  final _defaultHeaderMap = <String, String>{};

  /// Returns the current HTTP [Client] instance to use in this class.
  ///
  /// The return value is guaranteed to never be null.
  Client get client => _client;

  /// Requests to use a new HTTP [Client] in this class.
  set client(Client newClient) {
    _client = newClient;
  }

  Map<String, String> get defaultHeaderMap => _defaultHeaderMap;

  void addDefaultHeader(String key, String value) {
    _defaultHeaderMap[key] = value;
  }

  // We don't use a Map<String, String> for queryParams.
  // If collectionFormat is 'multi', a key might appear multiple times.
  Future<Response> invokeAPI(
    String path,
    String method,
    List<QueryParam> queryParams,
    Object? body,
    Map<String, String> headerParams,
    Map<String, String> formParams,
    String? contentType, {
    Future<void>? abortTrigger,
  }) async {
    await authentication?.applyToParams(queryParams, headerParams);

    headerParams.addAll(_defaultHeaderMap);
    if (contentType != null) {
      headerParams['Content-Type'] = contentType;
    }

    final urlEncodedQueryParams = queryParams.map((param) => '$param');
    final queryString = urlEncodedQueryParams.isNotEmpty
        ? '?${urlEncodedQueryParams.join('&')}'
        : '';
    final uri = Uri.parse('$basePath$path$queryString');

    try {
      // Special case for uploading a single file which isn't a 'multipart/form-data'.
      if (body is MultipartFile &&
          (contentType == null ||
              !contentType.toLowerCase().startsWith('multipart/form-data'))) {
        final request =
            AbortableStreamedRequest(method, uri, abortTrigger: abortTrigger);
        request.headers.addAll(headerParams);
        request.contentLength = body.length;
        body.finalize().listen(
              request.sink.add,
              onDone: request.sink.close,
              // ignore: avoid_types_on_closure_parameters
              onError: (Object error, StackTrace trace) => request.sink.close(),
              cancelOnError: true,
            );
        final response = await _client.send(request);
        return Response.fromStream(response);
      }

      if (body is MultipartRequest) {
        final request =
            AbortableMultipartRequest(method, uri, abortTrigger: abortTrigger);
        request.fields.addAll(body.fields);
        request.files.addAll(body.files);
        request.headers.addAll(body.headers);
        request.headers.addAll(headerParams);
        final response = await _client.send(request);
        return Response.fromStream(response);
      }

      final msgBody = contentType == 'application/x-www-form-urlencoded'
          ? formParams
          : await serializeAsync(body);
      final nullableHeaderParams = headerParams.isEmpty ? null : headerParams;

      final request = AbortableRequest(method, uri, abortTrigger: abortTrigger);
      if (nullableHeaderParams != null) {
        request.headers.addAll(nullableHeaderParams);
      }
      if (msgBody is String && msgBody.isNotEmpty) {
        request.body = msgBody;
      } else if (msgBody is List<int> && msgBody.isNotEmpty) {
        request.bodyBytes = msgBody;
      } else if (msgBody is Map<String, String>) {
        request.bodyFields = msgBody;
      }
      final response = await _client.send(request);
      return Response.fromStream(response);
    } on SocketException catch (error, trace) {
      throw ApiException.withInner(
        HttpStatus.badRequest,
        'Socket operation failed: $method $path',
        error,
        trace,
      );
    } on TlsException catch (error, trace) {
      throw ApiException.withInner(
        HttpStatus.badRequest,
        'TLS/SSL communication failed: $method $path',
        error,
        trace,
      );
    } on IOException catch (error, trace) {
      throw ApiException.withInner(
        HttpStatus.badRequest,
        'I/O operation failed: $method $path',
        error,
        trace,
      );
    } on ClientException catch (error, trace) {
      throw ApiException.withInner(
        HttpStatus.badRequest,
        'HTTP connection failed: $method $path',
        error,
        trace,
      );
    } on Exception catch (error, trace) {
      throw ApiException.withInner(
        HttpStatus.badRequest,
        'Exception occurred: $method $path',
        error,
        trace,
      );
    }
  }

  Future<dynamic> deserializeAsync(
    String value,
    String targetType, {
    bool growable = false,
  }) async =>
      // ignore: deprecated_member_use_from_same_package
      deserialize(value, targetType, growable: growable);

  @Deprecated(
      'Scheduled for removal in OpenAPI Generator 6.x. Use deserializeAsync() instead.')
  dynamic deserialize(
    String value,
    String targetType, {
    bool growable = false,
  }) {
    // Remove all spaces. Necessary for regular expressions as well.
    targetType =
        targetType.replaceAll(' ', ''); // ignore: parameter_assignments

    // If the expected target type is String, nothing to do...
    return targetType == 'String'
        ? value
        : fromJson(json.decode(value), targetType, growable: growable);
  }

  // ignore: deprecated_member_use_from_same_package
  Future<String> serializeAsync(Object? value) async => serialize(value);

  @Deprecated(
      'Scheduled for removal in OpenAPI Generator 6.x. Use serializeAsync() instead.')
  String serialize(Object? value) => value == null ? '' : json.encode(value);

  /// Returns a native instance of an OpenAPI class matching the [specified type][targetType].
  static dynamic fromJson(
    dynamic value,
    String targetType, {
    bool growable = false,
  }) {
    try {
      switch (targetType) {
        case 'String':
          return value is String ? value : value.toString();
        case 'int':
          return value is int ? value : int.parse('$value');
        case 'double':
          return value is double ? value : double.parse('$value');
        case 'bool':
          if (value is bool) {
            return value;
          }
          final valueString = '$value'.toLowerCase();
          return valueString == 'true' || valueString == '1';
        case 'DateTime':
          return value is DateTime ? value : DateTime.tryParse(value);
        case 'AccountGetDataExport200Response':
          return AccountGetDataExport200Response.fromJson(value);
        case 'AccountGetDataExport200ResponseExport':
          return AccountGetDataExport200ResponseExport.fromJson(value);
        case 'AccountGoogleProofBegin200Response':
          return AccountGoogleProofBegin200Response.fromJson(value);
        case 'AccountGoogleProofBeginRequest':
          return AccountGoogleProofBeginRequest.fromJson(value);
        case 'AccountGoogleProofComplete200Response':
          return AccountGoogleProofComplete200Response.fromJson(value);
        case 'AccountGoogleProofCompleteRequest':
          return AccountGoogleProofCompleteRequest.fromJson(value);
        case 'AccountRequestDataExport202Response':
          return AccountRequestDataExport202Response.fromJson(value);
        case 'ApiError':
          return ApiError.fromJson(value);
        case 'ApiErrorCode':
          return ApiErrorCodeTypeTransformer().decode(value);
        case 'ApiErrorError':
          return ApiErrorError.fromJson(value);
        case 'Conversation':
          return Conversation.fromJson(value);
        case 'ConversationCapabilities':
          return ConversationCapabilities.fromJson(value);
        case 'CreateDailyPostRequest':
          return CreateDailyPostRequest.fromJson(value);
        case 'CreateDirectConversation200Response':
          return CreateDirectConversation200Response.fromJson(value);
        case 'CreateDirectConversation200ResponseConversation':
          return CreateDirectConversation200ResponseConversation.fromJson(
              value);
        case 'CreateDirectConversation200ResponseConversationPeer':
          return CreateDirectConversation200ResponseConversationPeer.fromJson(
              value);
        case 'CreateDirectConversationRequest':
          return CreateDirectConversationRequest.fromJson(value);
        case 'CreateMediaReservationRequest':
          return CreateMediaReservationRequest.fromJson(value);
        case 'CreateMediaReservationResponse':
          return CreateMediaReservationResponse.fromJson(value);
        case 'CreateRealtimeTicket201Response':
          return CreateRealtimeTicket201Response.fromJson(value);
        case 'CurrentPostingDayResponse':
          return CurrentPostingDayResponse.fromJson(value);
        case 'DailyPost':
          return DailyPost.fromJson(value);
        case 'DailyPostMedia':
          return DailyPostMedia.fromJson(value);
        case 'DailyPostPrompt':
          return DailyPostPrompt.fromJson(value);
        case 'DailyPostTomorrowNote':
          return DailyPostTomorrowNote.fromJson(value);
        case 'DailyPromptResponse':
          return DailyPromptResponse.fromJson(value);
        case 'DirectPairLookup':
          return DirectPairLookup.fromJson(value);
        case 'EditMessageRequest':
          return EditMessageRequest.fromJson(value);
        case 'FeedPage':
          return FeedPage.fromJson(value);
        case 'FeedPost':
          return FeedPost.fromJson(value);
        case 'FeedPostAuthor':
          return FeedPostAuthor.fromJson(value);
        case 'FeedPostPrompt':
          return FeedPostPrompt.fromJson(value);
        case 'GetMessagingUnread200Response':
          return GetMessagingUnread200Response.fromJson(value);
        case 'HealthResponse':
          return HealthResponse.fromJson(value);
        case 'LegalAcceptCurrentTerms200Response':
          return LegalAcceptCurrentTerms200Response.fromJson(value);
        case 'LegalAcceptCurrentTermsRequest':
          return LegalAcceptCurrentTermsRequest.fromJson(value);
        case 'LegalGetCurrentTerms200Response':
          return LegalGetCurrentTerms200Response.fromJson(value);
        case 'LegalGetCurrentTermsContent200Response':
          return LegalGetCurrentTermsContent200Response.fromJson(value);
        case 'LegalGetCurrentTermsContent200ResponseTerms':
          return LegalGetCurrentTermsContent200ResponseTerms.fromJson(value);
        case 'LegalGetPublishedTermsContent200Response':
          return LegalGetPublishedTermsContent200Response.fromJson(value);
        case 'LegalGetPublishedTermsContent200ResponseTerms':
          return LegalGetPublishedTermsContent200ResponseTerms.fromJson(value);
        case 'LegalGetTermsNotice200Response':
          return LegalGetTermsNotice200Response.fromJson(value);
        case 'LegalGetTermsNotice200ResponseNotice':
          return LegalGetTermsNotice200ResponseNotice.fromJson(value);
        case 'LegalIssueRegistrationIntent201Response':
          return LegalIssueRegistrationIntent201Response.fromJson(value);
        case 'LegalIssueRegistrationIntent201ResponseTerms':
          return LegalIssueRegistrationIntent201ResponseTerms.fromJson(value);
        case 'LegalIssueRegistrationIntentRequest':
          return LegalIssueRegistrationIntentRequest.fromJson(value);
        case 'ListConversationChanges200Response':
          return ListConversationChanges200Response.fromJson(value);
        case 'ListConversationChanges200ResponseItemsInner':
          return ListConversationChanges200ResponseItemsInner.fromJson(value);
        case 'ListConversations200Response':
          return ListConversations200Response.fromJson(value);
        case 'ListMessages200Response':
          return ListMessages200Response.fromJson(value);
        case 'MarkConversationRead200Response':
          return MarkConversationRead200Response.fromJson(value);
        case 'MarkConversationReadRequest':
          return MarkConversationReadRequest.fromJson(value);
        case 'MediaContentType':
          return MediaContentTypeTypeTransformer().decode(value);
        case 'MediaReservation':
          return MediaReservation.fromJson(value);
        case 'MediaReservationStatus':
          return MediaReservationStatusTypeTransformer().decode(value);
        case 'MediaReservationUpload':
          return MediaReservationUpload.fromJson(value);
        case 'MediaValidationFailureReason':
          return MediaValidationFailureReasonTypeTransformer().decode(value);
        case 'Message':
          return Message.fromJson(value);
        case 'MessageReactionsInner':
          return MessageReactionsInner.fromJson(value);
        case 'MessageReplyPreview':
          return MessageReplyPreview.fromJson(value);
        case 'PendingRelationshipRequest':
          return PendingRelationshipRequest.fromJson(value);
        case 'PendingRequestPage':
          return PendingRequestPage.fromJson(value);
        case 'PostAudience':
          return PostAudienceTypeTransformer().decode(value);
        case 'PostDetail':
          return PostDetail.fromJson(value);
        case 'PostDetailAuthor':
          return PostDetailAuthor.fromJson(value);
        case 'PostDetailPrompt':
          return PostDetailPrompt.fromJson(value);
        case 'RegisterPushDeviceRequest':
          return RegisterPushDeviceRequest.fromJson(value);
        case 'RelationshipProfile':
          return RelationshipProfile.fromJson(value);
        case 'RelationshipState':
          return RelationshipStateTypeTransformer().decode(value);
        case 'RelationshipStatus':
          return RelationshipStatus.fromJson(value);
        case 'RelationshipUserCard':
          return RelationshipUserCard.fromJson(value);
        case 'RelationshipUserPage':
          return RelationshipUserPage.fromJson(value);
        case 'ResolveMessageRequestRequest':
          return ResolveMessageRequestRequest.fromJson(value);
        case 'SendMessageRequest':
          return SendMessageRequest.fromJson(value);
        case 'SendRelationshipRequest':
          return SendRelationshipRequest.fromJson(value);
        case 'SetMessageReactionRequest':
          return SetMessageReactionRequest.fromJson(value);
        case 'TestResponse':
          return TestResponse.fromJson(value);
        case 'UsernameProfile':
          return UsernameProfile.fromJson(value);
        case 'UsernameSetupRequest':
          return UsernameSetupRequest.fromJson(value);
        default:
          dynamic match;
          if (value is List &&
              (match = _regList.firstMatch(targetType)?.group(1)) != null) {
            return value
                .map<dynamic>((dynamic v) => fromJson(
                      v,
                      match,
                      growable: growable,
                    ))
                .toList(growable: growable);
          }
          if (value is Set &&
              (match = _regSet.firstMatch(targetType)?.group(1)) != null) {
            return value
                .map<dynamic>((dynamic v) => fromJson(
                      v,
                      match,
                      growable: growable,
                    ))
                .toSet();
          }
          if (value is Map &&
              (match = _regMap.firstMatch(targetType)?.group(1)) != null) {
            return Map<String, dynamic>.fromIterables(
              value.keys.cast<String>(),
              value.values.map<dynamic>((dynamic v) => fromJson(
                    v,
                    match,
                    growable: growable,
                  )),
            );
          }
      }
    } on Exception catch (error, trace) {
      throw ApiException.withInner(
        HttpStatus.internalServerError,
        'Exception during deserialization.',
        error,
        trace,
      );
    }
    throw ApiException(
      HttpStatus.internalServerError,
      'Could not find a suitable class for deserialization',
    );
  }
}

/// Primarily intended for use in an isolate.
class DeserializationMessage {
  const DeserializationMessage({
    required this.json,
    required this.targetType,
    this.growable = false,
  });

  /// The JSON value to deserialize.
  final String json;

  /// Target type to deserialize to.
  final String targetType;

  /// Whether to make deserialized lists or maps growable.
  final bool growable;
}

/// Primarily intended for use in an isolate.
Future<dynamic> decodeAsync(DeserializationMessage message) async {
  // Remove all spaces. Necessary for regular expressions as well.
  final targetType = message.targetType.replaceAll(' ', '');

  // If the expected target type is String, nothing to do...
  return targetType == 'String' ? message.json : json.decode(message.json);
}

/// Primarily intended for use in an isolate.
Future<dynamic> deserializeAsync(DeserializationMessage message) async {
  // Remove all spaces. Necessary for regular expressions as well.
  final targetType = message.targetType.replaceAll(' ', '');

  // If the expected target type is String, nothing to do...
  return targetType == 'String'
      ? message.json
      : ApiClient.fromJson(
          json.decode(message.json),
          targetType,
          growable: message.growable,
        );
}

/// Primarily intended for use in an isolate.
Future<String> serializeAsync(Object? value) async =>
    value == null ? '' : json.encode(value);

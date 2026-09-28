import 'dart:convert';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;

import '../api/api_failure.dart';

class MessagingMessage {
  const MessagingMessage({
    required this.id,
    required this.conversationId,
    required this.sequence,
    required this.senderId,
    required this.clientMessageId,
    required this.text,
    required this.version,
    required this.unsentAt,
  });

  final String id;
  final String conversationId;
  final String sequence;
  final String senderId;
  final String clientMessageId;
  final String? text;
  final int version;
  final DateTime? unsentAt;

  factory MessagingMessage.fromJson(Map<String, dynamic> json) =>
      MessagingMessage(
        id: json['id'] as String,
        conversationId: json['conversationId'] as String,
        sequence: json['sequence'] as String,
        senderId: json['senderId'] as String,
        clientMessageId: json['clientMessageId'] as String,
        text: json['text'] as String?,
        version: json['version'] as int,
        unsentAt: json['unsentAt'] is String
            ? DateTime.parse(json['unsentAt'] as String)
            : null,
      );
}

class MessagingConversation {
  const MessagingConversation({
    required this.id,
    required this.peerName,
    required this.unreadCount,
    required this.latestMessage,
  });

  final String id;
  final String peerName;
  final int unreadCount;
  final MessagingMessage? latestMessage;

  factory MessagingConversation.fromJson(Map<String, dynamic> json) {
    final peer = json['peer'] as Map<String, dynamic>?;
    final latest = json['latestMessage'];
    return MessagingConversation(
      id: json['id'] as String,
      peerName: peer?['name'] as String? ?? 'conversation',
      unreadCount: json['unreadCount'] as int? ?? 0,
      latestMessage: latest is Map<String, dynamic>
          ? MessagingMessage.fromJson(latest)
          : null,
    );
  }
}

abstract interface class MessagingClient {
  Future<ApiResult<List<MessagingConversation>>> inbox();
  Future<ApiResult<List<MessagingMessage>>> messages(String conversationId);
  Future<ApiResult<MessagingMessage>> send({
    required String conversationId,
    required String clientMessageId,
    required String text,
  });
}

class UnavailableMessagingClient implements MessagingClient {
  const UnavailableMessagingClient();

  @override
  Future<ApiResult<List<MessagingConversation>>> inbox() async =>
      const ApiError(ServiceUnavailable());
  @override
  Future<ApiResult<List<MessagingMessage>>> messages(
    String conversationId,
  ) async => const ApiError(ServiceUnavailable());
  @override
  Future<ApiResult<MessagingMessage>> send({
    required String conversationId,
    required String clientMessageId,
    required String text,
  }) async => const ApiError(ServiceUnavailable());
}

/// Generated OpenAPI client boundary. It sends no actor identifier from the app.
class HttpMessagingClient implements MessagingClient {
  HttpMessagingClient({required String baseUrl, required this.bearerToken})
    : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');

  final String _baseUrl;
  final Future<String?> Function() bearerToken;

  Future<generated.MessagingApi?> _api() async {
    final token = await bearerToken();
    if (token == null) return null;
    final auth = generated.HttpBearerAuth()..accessToken = token;
    return generated.MessagingApi(
      generated.ApiClient(basePath: _baseUrl, authentication: auth),
    );
  }

  @override
  Future<ApiResult<List<MessagingConversation>>> inbox() async {
    final api = await _api();
    if (api == null) return const ApiError(Unauthenticated());
    try {
      final result = await api.listConversations(folder: 'inbox');
      if (result == null) return const ApiError(ServiceUnavailable());
      return ApiSuccess(result.items.map(_conversation).toList());
    } on generated.ApiException catch (error) {
      return ApiError(_failure(error));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }
  }

  @override
  Future<ApiResult<List<MessagingMessage>>> messages(
    String conversationId,
  ) async {
    final api = await _api();
    if (api == null) return const ApiError(Unauthenticated());
    try {
      final result = await api.listMessages(conversationId);
      if (result == null) return const ApiError(ServiceUnavailable());
      return ApiSuccess(result.items.map(_message).toList());
    } on generated.ApiException catch (error) {
      return ApiError(_failure(error));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }
  }

  @override
  Future<ApiResult<MessagingMessage>> send({
    required String conversationId,
    required String clientMessageId,
    required String text,
  }) async {
    final api = await _api();
    if (api == null) return const ApiError(Unauthenticated());
    try {
      final result = await api.sendMessage(
        conversationId,
        generated.SendMessageRequest(
          clientMessageId: clientMessageId,
          text: text,
        ),
      );
      if (result == null) return const ApiError(ServiceUnavailable());
      return ApiSuccess(_message(result));
    } on generated.ApiException catch (error) {
      return ApiError(_failure(error));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }
  }

  static MessagingMessage _message(generated.Message value) =>
      MessagingMessage.fromJson(
        jsonDecode(jsonEncode(value.toJson())) as Map<String, dynamic>,
      );
  static MessagingConversation _conversation(generated.Conversation value) =>
      MessagingConversation.fromJson(
        jsonDecode(jsonEncode(value.toJson())) as Map<String, dynamic>,
      );
  static ApiFailure _failure(generated.ApiException error) {
    if (error.innerException != null) return const NetworkUnavailable();
    if (error.code == 401) return const Unauthenticated();
    if (error.code == 400 || error.code == 409 || error.code == 422) {
      return const InvalidRequest('That message could not be saved.');
    }
    return const ServiceUnavailable();
  }
}

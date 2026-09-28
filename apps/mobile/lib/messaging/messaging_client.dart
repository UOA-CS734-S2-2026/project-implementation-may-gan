import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

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

/// REST boundary for the generated messaging client that lands with OpenAPI.
/// This temporary adapter keeps Flutter UI testable while PR1 auth and route
/// registration are integrated. It sends no actor identifier from the app.
class HttpMessagingClient implements MessagingClient {
  HttpMessagingClient({
    required String baseUrl,
    required this.bearerToken,
    http.Client? client,
  }) : _base = Uri.parse(baseUrl.replaceFirst(RegExp(r'/$'), '')),
       _client = client ?? http.Client();

  final Uri _base;
  final Future<String?> Function() bearerToken;
  final http.Client _client;

  @override
  Future<ApiResult<List<MessagingConversation>>> inbox() async {
    final result = await _request('/api/v1/conversations?folder=inbox');
    if (result is ApiError<Map<String, dynamic>>) {
      return ApiError(result.failure);
    }
    final body = (result as ApiSuccess<Map<String, dynamic>>).value;
    final items = body['items'];
    if (items is! List) {
      return const ApiError(ServiceUnavailable());
    }
    return ApiSuccess(
      items
          .whereType<Map<String, dynamic>>()
          .map(MessagingConversation.fromJson)
          .toList(),
    );
  }

  @override
  Future<ApiResult<List<MessagingMessage>>> messages(
    String conversationId,
  ) async {
    final result = await _request(
      '/api/v1/conversations/${Uri.encodeComponent(conversationId)}/messages',
    );
    if (result is ApiError<Map<String, dynamic>>) {
      return ApiError(result.failure);
    }
    final items = (result as ApiSuccess<Map<String, dynamic>>).value['items'];
    if (items is! List) {
      return const ApiError(ServiceUnavailable());
    }
    return ApiSuccess(
      items
          .whereType<Map<String, dynamic>>()
          .map(MessagingMessage.fromJson)
          .toList(),
    );
  }

  @override
  Future<ApiResult<MessagingMessage>> send({
    required String conversationId,
    required String clientMessageId,
    required String text,
  }) async {
    final result = await _request(
      '/api/v1/conversations/${Uri.encodeComponent(conversationId)}/messages',
      method: 'POST',
      body: {'clientMessageId': clientMessageId, 'text': text},
    );
    if (result is ApiError<Map<String, dynamic>>) {
      return ApiError(result.failure);
    }
    try {
      return ApiSuccess(
        MessagingMessage.fromJson(
          (result as ApiSuccess<Map<String, dynamic>>).value,
        ),
      );
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    }
  }

  Future<ApiResult<Map<String, dynamic>>> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final token = await bearerToken();
    if (token == null) {
      return const ApiError(Unauthenticated());
    }
    try {
      final response = await _client.send(
        http.Request(method, _base.resolve(path))
          ..headers.addAll({
            'authorization': 'Bearer $token',
            'accept': 'application/json',
            if (body != null) 'content-type': 'application/json',
          })
          ..body = body == null ? '' : jsonEncode(body),
      );
      final text = await response.stream.bytesToString();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        if (response.statusCode == 401) {
          return const ApiError(Unauthenticated());
        }
        if (response.statusCode == 400 ||
            response.statusCode == 409 ||
            response.statusCode == 422) {
          return const ApiError(
            InvalidRequest('That message could not be saved.'),
          );
        }
        return const ApiError(ServiceUnavailable());
      }
      final decoded = jsonDecode(text);
      return decoded is Map<String, dynamic>
          ? ApiSuccess(decoded)
          : const ApiError(ServiceUnavailable());
    } on SocketException {
      return const ApiError(NetworkUnavailable());
    } on http.ClientException {
      return const ApiError(NetworkUnavailable());
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    }
  }
}

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

class RealtimeTicket {
  const RealtimeTicket({required this.ticket, required this.webSocketUrl});
  final String ticket;
  final String webSocketUrl;
}

class MessagingChangePage {
  const MessagingChangePage({
    required this.highWatermark,
    required this.hasMore,
    required this.nextChangeSequence,
  });
  final String highWatermark;
  final bool hasMore;
  final String? nextChangeSequence;
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
  Future<ApiResult<RealtimeTicket>> issueRealtimeTicket();
  Future<ApiResult<MessagingChangePage>> changes(
    String conversationId, {
    required String afterChangeSequence,
  });
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
  Future<ApiResult<RealtimeTicket>> issueRealtimeTicket() async =>
      const ApiError(ServiceUnavailable());
  @override
  Future<ApiResult<MessagingChangePage>> changes(
    String conversationId, {
    required String afterChangeSequence,
  }) async => const ApiError(ServiceUnavailable());
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
  Future<ApiResult<RealtimeTicket>> issueRealtimeTicket() async {
    final token = await bearerToken();
    if (token == null) return const ApiError(Unauthenticated());
    return _rawJson<RealtimeTicket>(
      '/api/v1/realtime/tickets',
      method: 'POST',
      token: token,
      body: const {},
      decode: (json) => RealtimeTicket(
        ticket: json['ticket'] as String,
        webSocketUrl: json['webSocketUrl'] as String,
      ),
    );
  }

  @override
  Future<ApiResult<MessagingChangePage>> changes(
    String conversationId, {
    required String afterChangeSequence,
  }) async {
    final token = await bearerToken();
    if (token == null) return const ApiError(Unauthenticated());
    return _rawJson<MessagingChangePage>(
      '/api/v1/conversations/$conversationId/changes?afterChangeSequence=${Uri.encodeQueryComponent(afterChangeSequence)}',
      token: token,
      decode: (json) => MessagingChangePage(
        highWatermark: json['highWatermark'] as String,
        hasMore: json['hasMore'] as bool? ?? false,
        nextChangeSequence: json['nextChangeSequence'] as String?,
      ),
    );
  }

  Future<ApiResult<T>> _rawJson<T>(
    String path, {
    required String token,
    String method = 'GET',
    Object? body,
    required T Function(Map<String, dynamic>) decode,
  }) async {
    final client = HttpClient();
    try {
      final request = await client.openUrl(method, Uri.parse('$_baseUrl$path'));
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      if (body != null) {
        request.headers.contentType = ContentType.json;
        request.write(jsonEncode(body));
      }
      final response = await request.close();
      final text = await utf8.decodeStream(response);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return ApiError(_rawFailure(response.statusCode));
      }
      final value = jsonDecode(text);
      if (value is! Map<String, dynamic>)
        return const ApiError(ServiceUnavailable());
      return ApiSuccess(decode(value));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    } finally {
      client.close(force: true);
    }
  }

  static ApiFailure _rawFailure(int status) {
    if (status == 401) return const Unauthenticated();
    if (status == 400 || status == 409 || status == 422) {
      return const InvalidRequest(
        'Messaging state changed. Refresh and try again.',
      );
    }
    return const ServiceUnavailable();
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

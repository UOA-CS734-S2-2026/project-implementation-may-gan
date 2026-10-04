import 'dart:convert';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;

import '../api/api_failure.dart';

class MessageReplyPreview {
  const MessageReplyPreview({
    required this.id,
    required this.senderId,
    required this.text,
    required this.unsentAt,
  });

  final String id;
  final String senderId;
  final String? text;
  final DateTime? unsentAt;

  factory MessageReplyPreview.fromJson(Map<String, dynamic> json) =>
      MessageReplyPreview(
        id: json['id'] as String,
        senderId: json['senderId'] as String,
        text: json['text'] as String?,
        unsentAt: _date(json['unsentAt']),
      );
}

class MessageReaction {
  const MessageReaction({
    required this.reaction,
    required this.count,
    required this.reactedByActor,
  });

  final String reaction;
  final int count;
  final bool reactedByActor;

  factory MessageReaction.fromJson(Map<String, dynamic> json) =>
      MessageReaction(
        reaction: json['reaction'] as String,
        count: json['count'] as int,
        reactedByActor: json['reactedByActor'] as bool,
      );
}

class MessagingMessage {
  const MessagingMessage({
    required this.id,
    required this.conversationId,
    required this.sequence,
    required this.senderId,
    required this.clientMessageId,
    required this.text,
    required this.replyToMessageId,
    required this.replyPreview,
    required this.version,
    required this.createdAt,
    required this.editedAt,
    required this.unsentAt,
    required this.reactions,
  });

  final String id;
  final String conversationId;
  final String sequence;
  final String senderId;
  final String clientMessageId;
  final String? text;
  final String? replyToMessageId;
  final MessageReplyPreview? replyPreview;
  final int version;
  final DateTime createdAt;
  final DateTime? editedAt;
  final DateTime? unsentAt;
  final List<MessageReaction> reactions;

  MessagingMessage copyWith({
    String? text,
    bool clearText = false,
    MessageReplyPreview? replyPreview,
    bool clearReplyPreview = false,
    int? version,
    DateTime? editedAt,
    DateTime? unsentAt,
    List<MessageReaction>? reactions,
  }) => MessagingMessage(
    id: id,
    conversationId: conversationId,
    sequence: sequence,
    senderId: senderId,
    clientMessageId: clientMessageId,
    text: clearText ? null : text ?? this.text,
    replyToMessageId: replyToMessageId,
    replyPreview: clearReplyPreview ? null : replyPreview ?? this.replyPreview,
    version: version ?? this.version,
    createdAt: createdAt,
    editedAt: editedAt ?? this.editedAt,
    unsentAt: unsentAt ?? this.unsentAt,
    reactions: reactions ?? this.reactions,
  );

  factory MessagingMessage.fromJson(Map<String, dynamic> json) =>
      MessagingMessage(
        id: json['id'] as String,
        conversationId: json['conversationId'] as String,
        sequence: json['sequence'] as String,
        senderId: json['senderId'] as String,
        clientMessageId: json['clientMessageId'] as String,
        text: json['text'] as String?,
        replyToMessageId: json['replyToMessageId'] as String?,
        replyPreview: json['replyPreview'] is Map<String, dynamic>
            ? MessageReplyPreview.fromJson(
                json['replyPreview'] as Map<String, dynamic>,
              )
            : null,
        version: json['version'] as int,
        createdAt:
            _date(json['createdAt']) ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        editedAt: _date(json['editedAt']),
        unsentAt: _date(json['unsentAt']),
        reactions: (json['reactions'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(MessageReaction.fromJson)
            .toList(growable: false),
      );
}

class MessagingConversation {
  const MessagingConversation({
    required this.id,
    required this.peerId,
    required this.peerName,
    required this.requestState,
    required this.unreadCount,
    required this.latestMessage,
    required this.lastMessageSequence,
    required this.lastChangeSequence,
    required this.lastReadSequence,
    required this.receiptSequence,
    required this.canSend,
    required this.canResolveRequest,
    this.updatedAt,
  });

  final String id;
  final String peerId;
  final String peerName;
  final String requestState;
  final int unreadCount;
  final MessagingMessage? latestMessage;
  final String lastMessageSequence;
  final String lastChangeSequence;
  final String lastReadSequence;
  final String receiptSequence;
  final bool canSend;
  final bool canResolveRequest;
  final DateTime? updatedAt;

  factory MessagingConversation.fromJson(Map<String, dynamic> json) {
    final peer = json['peer'] as Map<String, dynamic>? ?? const {};
    final capabilities =
        json['capabilities'] as Map<String, dynamic>? ?? const {};
    final latest = json['latestMessage'];
    return MessagingConversation(
      id: json['id'] as String,
      peerId: peer['id'] as String? ?? '',
      peerName: peer['name'] as String? ?? 'conversation',
      requestState: json['requestState'] as String? ?? 'active',
      unreadCount: json['unreadCount'] as int? ?? 0,
      latestMessage: latest is Map<String, dynamic>
          ? MessagingMessage.fromJson(latest)
          : null,
      lastMessageSequence: json['lastMessageSequence'] as String? ?? '0',
      lastChangeSequence: json['lastChangeSequence'] as String? ?? '0',
      lastReadSequence: json['lastReadSequence'] as String? ?? '0',
      receiptSequence: json['receiptSequence'] as String? ?? '0',
      canSend: capabilities['canSend'] as bool? ?? false,
      canResolveRequest: capabilities['canResolveRequest'] as bool? ?? false,
      updatedAt: _date(json['updatedAt']),
    );
  }
}

class MessagingPage {
  const MessagingPage({
    required this.items,
    required this.nextCursor,
    required this.hasMore,
  });

  final List<MessagingMessage> items;
  final String? nextCursor;
  final bool hasMore;
}

class MessagingChange {
  const MessagingChange({
    required this.changeSequence,
    required this.messageId,
  });
  final String changeSequence;
  final String? messageId;

  factory MessagingChange.fromJson(Map<String, dynamic> json) =>
      MessagingChange(
        changeSequence: json['changeSequence'] as String,
        messageId: json['messageId'] as String?,
      );
}

class RealtimeTicket {
  const RealtimeTicket({required this.ticket, required this.webSocketUrl});
  final String ticket;
  final String webSocketUrl;
}

class MessagingChangePage {
  const MessagingChangePage({
    required this.items,
    required this.highWatermark,
    required this.hasMore,
    required this.nextChangeSequence,
  });
  final List<MessagingChange> items;
  final String highWatermark;
  final bool hasMore;
  final String? nextChangeSequence;
}

class DirectConversationResult {
  const DirectConversationResult({
    required this.conversationId,
    required this.message,
  });
  final String conversationId;
  final MessagingMessage message;
}

class MarkReadResult {
  const MarkReadResult({
    required this.lastReadSequence,
    required this.receiptSequence,
    required this.unreadCount,
  });
  final String lastReadSequence;
  final String receiptSequence;
  final int unreadCount;
}

abstract interface class MessagingClient {
  Future<ApiResult<List<MessagingConversation>>> inbox({
    String folder = 'inbox',
  });
  Future<ApiResult<MessagingConversation>> conversation(String conversationId);
  Future<ApiResult<MessagingPage>> messages(
    String conversationId, {
    String? beforeSequence,
  });
  Future<ApiResult<MessagingMessage>> message(
    String conversationId,
    String messageId,
  );
  Future<ApiResult<DirectConversationResult>> createDirect({
    required String recipientId,
    required String clientMessageId,
    required String text,
  });
  Future<ApiResult<MessagingConversation>> resolveRequest(
    String conversationId,
    String decision,
  );
  Future<ApiResult<MarkReadResult>> markRead(
    String conversationId,
    String throughSequence,
  );
  Future<ApiResult<RealtimeTicket>> issueRealtimeTicket();
  Future<ApiResult<MessagingChangePage>> changes(
    String conversationId, {
    required String afterChangeSequence,
  });
  Future<ApiResult<MessagingMessage>> send({
    required String conversationId,
    required String clientMessageId,
    required String text,
    String? replyToMessageId,
  });
  Future<ApiResult<MessagingMessage>> edit({
    required String conversationId,
    required String messageId,
    required String text,
    required int expectedVersion,
  });
  Future<ApiResult<MessagingMessage>> unsend(
    String conversationId,
    String messageId,
  );
  Future<ApiResult<MessagingMessage>> setReaction(
    String conversationId,
    String messageId,
    String reaction,
  );
  Future<ApiResult<MessagingMessage>> removeReaction(
    String conversationId,
    String messageId,
  );
}

class UnavailableMessagingClient implements MessagingClient {
  const UnavailableMessagingClient();

  Future<ApiResult<T>> _unavailable<T>() async =>
      const ApiError(ServiceUnavailable());
  @override
  Future<ApiResult<List<MessagingConversation>>> inbox({
    String folder = 'inbox',
  }) => _unavailable();
  @override
  Future<ApiResult<MessagingConversation>> conversation(
    String conversationId,
  ) => _unavailable();
  @override
  Future<ApiResult<MessagingPage>> messages(
    String conversationId, {
    String? beforeSequence,
  }) => _unavailable();
  @override
  Future<ApiResult<MessagingMessage>> message(
    String conversationId,
    String messageId,
  ) => _unavailable();
  @override
  Future<ApiResult<DirectConversationResult>> createDirect({
    required String recipientId,
    required String clientMessageId,
    required String text,
  }) => _unavailable();
  @override
  Future<ApiResult<MessagingConversation>> resolveRequest(
    String conversationId,
    String decision,
  ) => _unavailable();
  @override
  Future<ApiResult<MarkReadResult>> markRead(
    String conversationId,
    String throughSequence,
  ) => _unavailable();
  @override
  Future<ApiResult<RealtimeTicket>> issueRealtimeTicket() => _unavailable();
  @override
  Future<ApiResult<MessagingChangePage>> changes(
    String conversationId, {
    required String afterChangeSequence,
  }) => _unavailable();
  @override
  Future<ApiResult<MessagingMessage>> send({
    required String conversationId,
    required String clientMessageId,
    required String text,
    String? replyToMessageId,
  }) => _unavailable();
  @override
  Future<ApiResult<MessagingMessage>> edit({
    required String conversationId,
    required String messageId,
    required String text,
    required int expectedVersion,
  }) => _unavailable();
  @override
  Future<ApiResult<MessagingMessage>> unsend(
    String conversationId,
    String messageId,
  ) => _unavailable();
  @override
  Future<ApiResult<MessagingMessage>> setReaction(
    String conversationId,
    String messageId,
    String reaction,
  ) => _unavailable();
  @override
  Future<ApiResult<MessagingMessage>> removeReaction(
    String conversationId,
    String messageId,
  ) => _unavailable();
}

/// Generated-client boundary for messaging. The generated DTOs rejected null
/// fields until the generator fix in #195, so this adapter decodes the same
/// generated OpenAPI operations from JSON without changing generated source.
class HttpMessagingClient implements MessagingClient {
  HttpMessagingClient({
    required String baseUrl,
    required this.bearerToken,
    this.onForbidden,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');

  final String _baseUrl;
  final Future<String?> Function() bearerToken;
  final void Function()? onForbidden;

  @override
  Future<ApiResult<List<MessagingConversation>>> inbox({
    String folder = 'inbox',
  }) => _json(
    '/api/v1/conversations?folder=${Uri.encodeQueryComponent(folder)}',
    decode: (json) => (json['items'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(MessagingConversation.fromJson)
        .toList(),
  );

  @override
  Future<ApiResult<MessagingConversation>> conversation(
    String conversationId,
  ) => _json(
    '/api/v1/conversations/${Uri.encodeComponent(conversationId)}',
    decode: MessagingConversation.fromJson,
  );

  @override
  Future<ApiResult<MessagingPage>> messages(
    String conversationId, {
    String? beforeSequence,
  }) {
    final query = beforeSequence == null
        ? ''
        : '?beforeSequence=${Uri.encodeQueryComponent(beforeSequence)}';
    return _json(
      '/api/v1/conversations/${Uri.encodeComponent(conversationId)}/messages$query',
      decode: (json) => MessagingPage(
        items: (json['items'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(MessagingMessage.fromJson)
            .toList(),
        nextCursor: json['nextCursor'] as String?,
        hasMore: json['hasMore'] as bool? ?? false,
      ),
    );
  }

  @override
  Future<ApiResult<MessagingMessage>> message(
    String conversationId,
    String messageId,
  ) => _json(
    '/api/v1/conversations/${Uri.encodeComponent(conversationId)}/messages/${Uri.encodeComponent(messageId)}',
    decode: MessagingMessage.fromJson,
  );

  Future<ApiResult<String?>> findDirect(String recipientId) async {
    final token = await bearerToken();
    if (token == null) return const ApiError(Unauthenticated());
    final client = HttpClient();
    try {
      final request = await client.getUrl(
        Uri.parse(
          '$_baseUrl/api/v1/conversations/direct/${Uri.encodeComponent(recipientId)}',
        ),
      );
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      final response = await request.close();
      final text = await utf8.decodeStream(response);
      if (response.statusCode == 404) {
        return const ApiSuccess(null);
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return ApiError(_failure(response.statusCode));
      }
      final body = jsonDecode(text) as Map<String, dynamic>;
      return ApiSuccess(body['conversationId'] as String?);
    } on IOException {
      return const ApiError(NetworkUnavailable());
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    } finally {
      client.close(force: true);
    }
  }

  @override
  Future<ApiResult<DirectConversationResult>> createDirect({
    required String recipientId,
    required String clientMessageId,
    required String text,
  }) => _json(
    '/api/v1/conversations/direct',
    method: 'POST',
    body: {
      'recipientId': recipientId,
      'clientMessageId': clientMessageId,
      'text': text,
    },
    decode: (json) => DirectConversationResult(
      conversationId:
          (json['conversation'] as Map<String, dynamic>)['id'] as String,
      message: MessagingMessage.fromJson(
        json['message'] as Map<String, dynamic>,
      ),
    ),
  );

  @override
  Future<ApiResult<MessagingConversation>> resolveRequest(
    String conversationId,
    String decision,
  ) => _json(
    '/api/v1/conversations/${Uri.encodeComponent(conversationId)}/request',
    method: 'PUT',
    body: {'decision': decision},
    decode: MessagingConversation.fromJson,
  );

  @override
  Future<ApiResult<MarkReadResult>> markRead(
    String conversationId,
    String throughSequence,
  ) => _json(
    '/api/v1/conversations/${Uri.encodeComponent(conversationId)}/read',
    method: 'PUT',
    body: {'throughSequence': throughSequence},
    decode: (json) => MarkReadResult(
      lastReadSequence: json['lastReadSequence'] as String,
      receiptSequence: json['receiptSequence'] as String,
      unreadCount: json['unreadCount'] as int,
    ),
  );

  @override
  Future<ApiResult<RealtimeTicket>> issueRealtimeTicket() => _json(
    '/api/v1/realtime/tickets',
    method: 'POST',
    body: const {},
    decode: (json) => RealtimeTicket(
      ticket: json['ticket'] as String,
      webSocketUrl: json['webSocketUrl'] as String,
    ),
  );

  @override
  Future<ApiResult<MessagingChangePage>> changes(
    String conversationId, {
    required String afterChangeSequence,
  }) => _json(
    '/api/v1/conversations/${Uri.encodeComponent(conversationId)}/changes?afterChangeSequence=${Uri.encodeQueryComponent(afterChangeSequence)}',
    decode: (json) => MessagingChangePage(
      items: (json['items'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(MessagingChange.fromJson)
          .toList(),
      highWatermark: json['highWatermark'] as String,
      hasMore: json['hasMore'] as bool? ?? false,
      nextChangeSequence: json['nextChangeSequence'] as String?,
    ),
  );

  @override
  Future<ApiResult<MessagingMessage>> send({
    required String conversationId,
    required String clientMessageId,
    required String text,
    String? replyToMessageId,
  }) => _messageAction('POST', conversationId, null, {
    'clientMessageId': clientMessageId,
    'text': text,
    if (replyToMessageId != null) 'replyToMessageId': replyToMessageId,
  });

  @override
  Future<ApiResult<MessagingMessage>> edit({
    required String conversationId,
    required String messageId,
    required String text,
    required int expectedVersion,
  }) => _messageAction('PATCH', conversationId, messageId, {
    'text': text,
    'expectedVersion': expectedVersion,
  });

  @override
  Future<ApiResult<MessagingMessage>> unsend(
    String conversationId,
    String messageId,
  ) => _messageAction('DELETE', conversationId, messageId, null);

  @override
  Future<ApiResult<MessagingMessage>> setReaction(
    String conversationId,
    String messageId,
    String reaction,
  ) => _messageAction('PUT', conversationId, '$messageId/reaction', {
    'reaction': reaction,
  });

  @override
  Future<ApiResult<MessagingMessage>> removeReaction(
    String conversationId,
    String messageId,
  ) => _messageAction('DELETE', conversationId, '$messageId/reaction', null);

  Future<ApiResult<MessagingMessage>> _messageAction(
    String method,
    String conversationId,
    String? messagePath,
    Object? body,
  ) {
    final suffix = messagePath == null
        ? 'messages'
        : 'messages/${messagePath.split('/').map(Uri.encodeComponent).join('/')}';
    return _json(
      '/api/v1/conversations/${Uri.encodeComponent(conversationId)}/$suffix',
      method: method,
      body: body,
      decode: MessagingMessage.fromJson,
    );
  }

  Future<ApiResult<T>> _json<T>(
    String path, {
    String method = 'GET',
    Object? body,
    required T Function(Map<String, dynamic>) decode,
  }) async {
    final token = await bearerToken();
    if (token == null) return const ApiError(Unauthenticated());
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
        return ApiError(_failure(response.statusCode));
      }
      final value = jsonDecode(text);
      if (value is! Map<String, dynamic>) {
        return const ApiError(ServiceUnavailable());
      }
      return ApiSuccess(decode(value));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    } finally {
      client.close(force: true);
    }
  }

  ApiFailure _failure(int status) {
    if (status == 401) {
      return const Unauthenticated();
    }
    if (status == 403) {
      try {
        onForbidden?.call();
      } catch (_) {}
      return const ServiceUnavailable();
    }
    if (status == 400 || status == 404 || status == 409 || status == 422) {
      return const InvalidRequest(
        'This action is no longer available. Refresh and try again.',
      );
    }
    return const ServiceUnavailable();
  }
}

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;

// Retain the generated package import at this boundary. Its endpoint classes
// establish the OpenAPI surface this adapter calls without hand-editing them.
final Type generatedMessagingApiType = generated.MessagingApi;

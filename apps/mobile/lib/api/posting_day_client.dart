import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;
import 'package:http/http.dart' as http;

import 'api_failure.dart';

/// Receives authenticated 403s from generated API adapters that do not need
/// per-client dependency wiring. App startup replaces it for each process.
void Function()? _authenticatedApiForbiddenHandler;

void configureAuthenticatedApiForbiddenHandler(void Function()? handler) {
  _authenticatedApiForbiddenHandler = handler;
}

/// The server-owned posting day, prompt, and deadline.
class PostingDay {
  const PostingDay({
    required this.serverNow,
    required this.localDate,
    required this.deadlineAt,
    required this.promptId,
    required this.promptText,
    required this.hasPosted,
  });

  final DateTime serverNow;
  final String localDate;
  final DateTime deadlineAt;
  final String promptId;
  final String promptText;
  final bool hasPosted;
}

abstract interface class PostingDayClient {
  Future<ApiResult<PostingDay>> current();
}

/// Reads the posting day through the generated Dart client with the stored
/// Better Auth bearer session.
class GeneratedPostingDayClient implements PostingDayClient {
  GeneratedPostingDayClient({
    required String baseUrl,
    required this._bearerToken,
    this.onForbidden,
    this.httpClient,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');

  final String _baseUrl;
  final Future<String?> Function() _bearerToken;

  /// Rechecks server policy after an authenticated ordinary-route refusal.
  final void Function()? onForbidden;
  final http.Client? httpClient;

  @override
  Future<ApiResult<PostingDay>> current() async {
    final token = await _bearerToken();
    if (token == null) return const ApiError(Unauthenticated());

    final auth = generated.HttpBearerAuth()..accessToken = token;
    final client = generated.ApiClient(
      basePath: _baseUrl,
      authentication: auth,
    );
    final httpClient = this.httpClient;
    if (httpClient != null) client.client = httpClient;
    final api = generated.PostingDaysApi(client);
    try {
      final day = await api.postingDaysCurrent();
      if (day == null) return const ApiError(ServiceUnavailable());
      return ApiSuccess(
        PostingDay(
          serverNow: day.serverNow,
          localDate: day.localDate,
          deadlineAt: day.deadlineAt,
          promptId: day.prompt.id,
          promptText: day.prompt.text,
          hasPosted: day.hasPosted,
        ),
      );
    } on generated.ApiException catch (error) {
      return ApiError(
        failureForStatus(
          error.code,
          error.innerException,
          onForbidden: onForbidden,
        ),
      );
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }
  }
}

/// Maps a generated-client failure to a transport-independent failure.
ApiFailure failureForStatus(
  int status,
  Exception? inner, {
  void Function()? onForbidden,
}) {
  // The generated client reports socket, TLS, and connection failures as
  // status 400 with the original exception attached.
  if (inner != null) return const NetworkUnavailable();
  if (status == 401) return const Unauthenticated();
  if (status == 403) {
    // The policy endpoint decides whether this was an ordinary resource
    // denial or newly effective Terms. Never let observer failure alter the
    // request result.
    try {
      (onForbidden ?? _authenticatedApiForbiddenHandler)?.call();
    } catch (_) {}
    return const ServiceUnavailable();
  }
  if (status == 400 || status == 422) {
    return const InvalidRequest('Some details need another look.');
  }
  return const ServiceUnavailable();
}

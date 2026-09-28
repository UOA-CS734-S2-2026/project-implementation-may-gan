import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'push_service.dart';

/// Authenticated API client for the body-free device registration endpoints.
class HttpPushRegistrationClient implements PushRegistrationClient {
  HttpPushRegistrationClient({
    required String baseUrl,
    required this.bearerToken,
    http.Client? client,
  }) : _base = Uri.parse(baseUrl.replaceFirst(RegExp(r'/$'), '')),
       _client = client ?? http.Client();

  final Uri _base;
  final Future<String?> Function() bearerToken;
  final http.Client _client;

  @override
  Future<void> register({
    required String installationId,
    required String token,
    required String platform,
    required bool optedIn,
  }) => _request('PUT', installationId, {
    'token': token,
    'platform': platform,
    'optedIn': optedIn,
  });

  @override
  Future<void> unregister(String installationId) =>
      _request('DELETE', installationId, null);

  Future<void> _request(
    String method,
    String installationId,
    Map<String, Object>? body,
  ) async {
    final token = await bearerToken();
    if (token == null) return;
    final request =
        http.Request(
            method,
            _base.resolve(
              '/api/v1/push/devices/${Uri.encodeComponent(installationId)}',
            ),
          )
          ..headers.addAll({
            'authorization': 'Bearer $token',
            'accept': 'application/json',
            if (body != null) 'content-type': 'application/json',
          })
          ..body = body == null ? '' : jsonEncode(body);
    try {
      final response = await _client.send(request);
      if (response.statusCode == 401 || response.statusCode == 403) return;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw const HttpException('Push registration failed.');
      }
    } on SocketException {
      // A later foreground token refresh can repair an offline registration.
    } on http.ClientException {
      // A later foreground token refresh can repair an offline registration.
    }
  }
}

/// A random installation identity survives app restart but not a secure-store wipe.
Future<String> loadInstallationId(FlutterSecureStorage storage) async {
  const key = 'dayli.notifications.installation-id';
  final existing = await storage.read(key: key);
  if (existing != null && existing.isNotEmpty) return existing;
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  final id = base64UrlEncode(bytes).replaceAll('=', '');
  await storage.write(key: key, value: id);
  return id;
}

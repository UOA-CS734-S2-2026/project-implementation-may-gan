import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'account_export_download.dart';

class AccountExportStatus {
  const AccountExportStatus({
    required this.requestId,
    required this.status,
    required this.requestedAt,
    required this.readyAt,
    required this.expiresAt,
  });

  final String? requestId;
  final String status;
  final DateTime? requestedAt;
  final DateTime? readyAt;
  final DateTime? expiresAt;

  bool get mayRequest =>
      const {'none', 'failed', 'cancelled', 'expired'}.contains(status);
  bool get mayDownload =>
      status == 'ready' && requestId != null && expiresAt != null;
}

abstract interface class AccountExportClient {
  Future<AccountExportStatus> status();
  Future<void> request();
  Future<File> download({required String requestId, required File destination});
}

class HttpAccountExportClient implements AccountExportClient {
  HttpAccountExportClient({
    required this.baseUrl,
    required this.bearerToken,
    http.Client? client,
  }) : _client = client ?? http.Client() {
    _downloader = AccountExportDownloader(
      baseUrl: baseUrl,
      bearerToken: bearerToken,
      client: _client,
    );
  }

  final String baseUrl;
  final Future<String?> Function() bearerToken;
  final http.Client _client;
  late final AccountExportDownloader _downloader;
  static const _states = {
    'none',
    'requested',
    'building',
    'ready',
    'failed',
    'cancelled',
    'expired',
  };

  Uri get _uri => Uri.parse(
    '${baseUrl.replaceFirst(RegExp(r'/$'), '')}/api/v1/account/export',
  );

  Future<Map<String, dynamic>> _json(String method, Uri uri) async {
    final token = await bearerToken();
    if (token == null) throw StateError('Sign in to request an export.');
    final request = http.Request(method, uri)
      ..headers['authorization'] = 'Bearer $token';
    final response = await _client.send(request);
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw StateError('Account export is unavailable.');
    }
    const maxResponseBytes = 16 * 1024;
    var received = 0;
    final bytes = <int>[];
    await for (final chunk in response.stream) {
      received += chunk.length;
      if (received > maxResponseBytes) {
        throw const FormatException('Export response is too large.');
      }
      bytes.addAll(chunk);
    }
    final body = jsonDecode(utf8.decode(bytes));
    if (body is! Map<String, dynamic>) {
      throw const FormatException('Invalid export response.');
    }
    return body;
  }

  @override
  Future<AccountExportStatus> status() async {
    final body = await _json('GET', _uri);
    final state = body['status'];
    final id = body['requestId'];
    if (state is! String ||
        !_states.contains(state) ||
        (id != null && (id is! String || id.isEmpty))) {
      throw const FormatException('Invalid export status.');
    }
    DateTime? parseTime(String name) {
      final value = body[name];
      if (value == null) return null;
      if (value is! String) {
        throw const FormatException('Invalid export timestamp.');
      }
      final parsed = DateTime.tryParse(value);
      if (parsed == null || !parsed.isUtc) {
        throw const FormatException('Invalid export timestamp.');
      }
      return parsed;
    }

    final result = AccountExportStatus(
      requestId: id as String?,
      status: state,
      requestedAt: parseTime('requestedAt'),
      readyAt: parseTime('readyAt'),
      expiresAt: parseTime('expiresAt'),
    );
    if (state == 'none' &&
            (result.requestId != null ||
                result.requestedAt != null ||
                result.readyAt != null ||
                result.expiresAt != null) ||
        state == 'ready' && !result.mayDownload) {
      throw const FormatException('Invalid export status.');
    }
    return result;
  }

  @override
  Future<void> request() async {
    final body = await _json(
      'POST',
      _uri.replace(path: '${_uri.path}/request'),
    );
    if (body['requestId'] is! String ||
        (body['requestId'] as String).isEmpty ||
        !const {
          'requested',
          'building',
          'ready',
          'expired',
        }.contains(body['status']) ||
        body['requestedAt'] is! String) {
      throw const FormatException('Invalid export request response.');
    }
  }

  @override
  Future<File> download({
    required String requestId,
    required File destination,
  }) => _downloader.download(requestId: requestId, destination: destination);
}

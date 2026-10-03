import 'dart:io';
import 'dart:math';

import 'package:http/http.dart' as http;

/// Writes an authenticated ZIP to a caller-chosen local file without buffering it.
/// The caller owns and protects the completed copy after the server's expiry.
class AccountExportDownloader {
  AccountExportDownloader({
    required this.baseUrl,
    required this.bearerToken,
    http.Client? client,
  }) : _client = client ?? http.Client();

  final String baseUrl;
  final Future<String?> Function() bearerToken;
  final http.Client _client;
  static const maxArchiveBytes = 250 * 1024 * 1024;
  static final _requestIdPattern = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false,
  );

  Future<File> download({
    required String requestId,
    required File destination,
  }) async {
    if (!_requestIdPattern.hasMatch(requestId)) {
      throw const FormatException('Invalid export request ID.');
    }
    if (await destination.exists()) {
      throw StateError('The destination already exists.');
    }
    final token = await bearerToken();
    if (token == null) throw StateError('Sign in to download an export.');
    final uri = Uri.parse(
      '${baseUrl.replaceFirst(RegExp(r'/$'), '')}/api/v1/account/export/$requestId/download',
    );
    final request = http.Request('GET', uri)
      ..headers['authorization'] = 'Bearer $token';
    final response = await _client.send(request);
    if (response.statusCode != 200 ||
        response.headers['content-type']
                ?.split(';')
                .first
                .trim()
                .toLowerCase() !=
            'application/zip') {
      throw StateError('The export is not available for download.');
    }
    final length = int.tryParse(response.headers['content-length'] ?? '');
    if (length == null || length < 1 || length > maxArchiveBytes) {
      throw StateError('Invalid export archive size.');
    }
    final part = File('${destination.path}.part-${_temporarySuffix()}');
    IOSink? sink;
    try {
      sink = part.openWrite();
      var received = 0;
      await for (final chunk in response.stream) {
        received += chunk.length;
        if (received > length || received > maxArchiveBytes) {
          throw StateError('Export archive exceeds its declared size.');
        }
        sink.add(chunk);
      }
      if (received != length) throw StateError('Export archive is incomplete.');
      await sink.flush();
      await sink.close();
      sink = null;
      if (await destination.exists()) {
        throw StateError('The destination already exists.');
      }
      return await part.rename(destination.path);
    } finally {
      if (sink != null) await sink.close();
      if (await part.exists()) await part.delete();
    }
  }

  String _temporarySuffix() {
    final bytes = List<int>.generate(16, (_) => Random.secure().nextInt(256));
    return bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
  }
}

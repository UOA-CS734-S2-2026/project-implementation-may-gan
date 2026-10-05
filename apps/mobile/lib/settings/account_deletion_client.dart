import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

class AccountDeletionStatus {
  const AccountDeletionStatus({required this.state, required this.cancelUntil});

  final String state;
  final DateTime? cancelUntil;
  bool get isPending => state == 'pending_deletion';
}

abstract interface class AccountDeletionClient {
  Future<AccountDeletionStatus> status();
  Future<void> requestWithPassword(String password);
  Future<void> cancelWithPassword(String password);
}

/// Native Google management proof is deliberately unsupported. A browser-only
/// proof must not be replaced with a mobile token that the server cannot bind.
class HttpAccountDeletionClient implements AccountDeletionClient {
  HttpAccountDeletionClient({
    required this.baseUrl,
    required this.bearerToken,
    http.Client? client,
  }) : _client = client ?? http.Client();

  final String baseUrl;
  final Future<String?> Function() bearerToken;
  final http.Client _client;

  Uri _uri(String suffix) => Uri.parse(
    '${baseUrl.replaceFirst(RegExp(r'/$'), '')}/api/v1/account/deletion$suffix',
  );

  Future<Map<String, dynamic>> _request(
    String method,
    Uri uri, {
    Map<String, String>? headers,
    Object? body,
  }) async {
    final token = await bearerToken();
    if (token == null) throw StateError('Sign in to manage account deletion.');
    final response = await _client.send(
      http.Request(method, uri)
        ..headers.addAll({
          'authorization': 'Bearer $token',
          if (body != null) 'content-type': 'application/json',
          ...?headers,
        })
        ..body = body == null ? '' : jsonEncode(body),
    );
    final bytes = await response.stream.fold<List<int>>(<int>[], (all, next) {
      if (all.length + next.length > 16 * 1024) {
        throw const FormatException('Deletion response is too large.');
      }
      return all..addAll(next);
    });
    final decoded = jsonDecode(utf8.decode(bytes));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Account deletion is unavailable.');
    }
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Invalid deletion response.');
    }
    return decoded;
  }

  @override
  Future<AccountDeletionStatus> status() async {
    final body = await _request('GET', _uri(''));
    final state = body['state'];
    if (state is! String ||
        !const {
          'active',
          'pending_deletion',
          'purging',
          'purge_failed',
        }.contains(state)) {
      throw const FormatException('Invalid deletion status.');
    }
    final value = body['cancelUntil'];
    final deadline = value == null
        ? null
        : value is String
        ? DateTime.tryParse(value)?.toUtc()
        : null;
    if (value != null && deadline == null) {
      throw const FormatException('Invalid deletion deadline.');
    }
    return AccountDeletionStatus(state: state, cancelUntil: deadline);
  }

  @override
  Future<void> requestWithPassword(String password) =>
      _proveThenSubmit('request_deletion', password);

  @override
  Future<void> cancelWithPassword(String password) =>
      _proveThenSubmit('cancel_deletion', password);

  Future<void> _proveThenSubmit(String action, String password) async {
    final proof = await _request(
      'POST',
      Uri.parse(
        '${baseUrl.replaceFirst(RegExp(r'/$'), '')}/api/v1/account/reauthenticate/password',
      ),
      body: {'action': action, 'password': password},
    );
    final grant = proof['token'];
    if (grant is! String || !RegExp(r'^[0-9a-f]{64}$').hasMatch(grant)) {
      throw const FormatException('Invalid action verification.');
    }
    final suffix = action == 'request_deletion' ? '/request' : '/cancel';
    await _request(
      'POST',
      _uri(suffix),
      headers: action == 'request_deletion'
          ? {'Idempotency-Key': _idempotencyKey()}
          : null,
      body: {'grantToken': grant},
    );
  }

  String _idempotencyKey() =>
      'native-${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}-${Random.secure().nextInt(1 << 32).toRadixString(36)}';
}

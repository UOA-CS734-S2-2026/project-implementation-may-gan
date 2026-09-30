import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

class LegalFailure implements Exception {
  const LegalFailure(this.message, [this.statusCode]);

  final String message;
  final int? statusCode;
}

class CanonicalTerms {
  const CanonicalTerms({
    required this.id,
    required this.version,
    required this.contentDigest,
    required this.effectiveAt,
    required this.canonicalContent,
  });

  final String id;
  final int version;
  final String contentDigest;
  final DateTime effectiveAt;
  final String canonicalContent;
}

class AccountPolicySnapshot {
  const AccountPolicySnapshot({required this.restriction, required this.allowed});

  final String restriction;
  final Set<String> allowed;

  bool get isActive => restriction == 'active';
  bool get needsLegalAcceptance =>
      restriction == 'terms_blocked' || restriction == 'age_declaration_blocked';
}

class LegalRegistrationIntent {
  const LegalRegistrationIntent({
    required this.intent,
    required this.flowBinding,
    required this.terms,
  });

  final String intent;
  final String flowBinding;
  final CanonicalTerms terms;
}

class LegalService {
  LegalService({required String baseUrl, http.Client? client})
      : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), ''),
        _client = client ?? http.Client();

  final String _baseUrl;
  final http.Client _client;

  Future<CanonicalTerms?> loadCurrentTerms() async {
    final response = await _client.get(_uri('/api/v1/legal/terms/current/content'));
    final body = _json(response);
    final terms = body['terms'];
    final content = body['canonicalContent'];
    if (terms == null && content == null) return null;
    if (terms is! Map<String, dynamic> || content is! String) {
      throw const LegalFailure('The current Terms could not be verified.');
    }
    return _terms(terms, content, requiredStatus: 'effective');
  }

  Future<AccountPolicySnapshot> readPolicy(String bearer) async {
    final response = await _client.get(
      _uri('/api/v1/account/policy'),
      headers: {'authorization': 'Bearer $bearer'},
    );
    final body = _json(response);
    final restriction = body['restriction'];
    final allowed = body['allowed'];
    if (restriction is! String || allowed is! List ||
        !allowed.every((item) => item is String)) {
      throw const LegalFailure('Account status is unavailable.');
    }
    return AccountPolicySnapshot(
      restriction: restriction,
      allowed: allowed.cast<String>().toSet(),
    );
  }

  Future<LegalRegistrationIntent> issueIntent(String flow) async {
    final response = await _client.post(
      _uri('/api/v1/legal/registration-intents'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({
        'flow': flow,
        'acceptTerms': true,
        'declareAge16OrOlder': true,
      }),
    );
    final body = _json(response);
    final intent = body['intent'];
    final binding = body['flowBinding'];
    final terms = body['terms'];
    if (intent is! String || !RegExp(r'^[0-9a-f]{64}$').hasMatch(intent) ||
        binding is! String || !RegExp(r'^[0-9a-f]{64}$').hasMatch(binding) ||
        terms is! Map<String, dynamic>) {
      throw const LegalFailure('Legal registration is unavailable.');
    }
    final canonical = await loadCurrentTerms();
    if (canonical == null || canonical.id != terms['id'] ||
        canonical.contentDigest != terms['contentDigest']) {
      throw const LegalFailure('The Terms changed. Read the current version.');
    }
    return LegalRegistrationIntent(
      intent: intent,
      flowBinding: binding,
      terms: canonical,
    );
  }

  Future<void> accept(CanonicalTerms terms, String bearer) async {
    final response = await _client.post(
      _uri('/api/v1/account/legal/acceptance'),
      headers: {'content-type': 'application/json', 'authorization': 'Bearer $bearer'},
      body: jsonEncode({
        'acceptTerms': true,
        'declareAge16OrOlder': true,
        'termsVersionId': terms.id,
        'contentDigest': terms.contentDigest,
      }),
    );
    _json(response);
  }

  Map<String, String> registrationHeaders(LegalRegistrationIntent intent) => {
        'x-dayli-registration-intent': intent.intent,
        'x-dayli-registration-binding': intent.flowBinding,
      };

  CanonicalTerms _terms(
    Map<String, dynamic> terms,
    String content, {
    required String requiredStatus,
  }) {
    final id = terms['id'];
    final version = terms['version'];
    final digest = terms['contentDigest'];
    final effectiveAt = terms['effectiveAt'];
    if (id is! String || version is! int || digest is! String ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(digest) || effectiveAt is! String ||
        terms['status'] != requiredStatus || sha256.convert(utf8.encode(content)).toString() != digest) {
      throw const LegalFailure('The current Terms could not be verified.');
    }
    final parsedEffectiveAt = DateTime.tryParse(effectiveAt);
    if (parsedEffectiveAt == null) {
      throw const LegalFailure('The current Terms could not be verified.');
    }
    return CanonicalTerms(
      id: id,
      version: version,
      contentDigest: digest,
      effectiveAt: parsedEffectiveAt.toUtc(),
      canonicalContent: content,
    );
  }

  Map<String, dynamic> _json(http.Response response) {
    if (response.statusCode >= 400) {
      throw LegalFailure(
        response.statusCode == 409
            ? 'The Terms changed. Read the current version.'
            : 'Legal information is unavailable. Try again.',
        response.statusCode,
      );
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const LegalFailure('Legal information is unavailable. Try again.');
    }
    return decoded;
  }

  Uri _uri(String path) => Uri.parse('$_baseUrl$path');
}

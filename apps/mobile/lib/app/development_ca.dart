import 'dart:convert';

import 'package:flutter/foundation.dart';

/// The `--dart-define` that carries a base64-encoded local development root
/// certificate, such as mkcert's `rootCA.pem`.
const developmentCaDefine = 'DAYLI_DEV_CA_PEM_B64';

/// Returns the PEM bytes of a local development root certificate to add to
/// Dart's default `SecurityContext`, or null when there is none to trust.
///
/// Dart's `HttpClient` verifies TLS with its own trust store. On Android it
/// reads only the system CAs, so a user-installed CA and
/// `network_security_config` do not reach Dart HTTP. Adding these bytes trusts
/// exactly one certificate on top of the platform roots.
///
/// Returns null when [pemBase64] is empty or [debugMode] is false. Throws a
/// [FormatException] for anything other than a single PEM certificate.
List<int>? developmentCaBytes(String pemBase64, {bool debugMode = kDebugMode}) {
  if (!debugMode || pemBase64.isEmpty) return null;

  final List<int> bytes;
  try {
    bytes = base64.decode(pemBase64.replaceAll(RegExp(r'\s'), ''));
  } on FormatException {
    throw const FormatException('$developmentCaDefine is not valid base64.');
  }
  final pem = utf8.decode(bytes, allowMalformed: true);
  if (pem.contains('PRIVATE KEY')) {
    throw const FormatException(
      '$developmentCaDefine contains a private key. Pass rootCA.pem only.',
    );
  }
  final certificates = '-----BEGIN CERTIFICATE-----'.allMatches(pem).length;
  if (certificates != 1) {
    throw const FormatException(
      '$developmentCaDefine must contain exactly one PEM certificate.',
    );
  }
  return bytes;
}

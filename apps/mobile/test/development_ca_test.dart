import 'dart:convert';
import 'dart:io';

import 'package:dayli_mobile/app/development_ca.dart';
import 'package:flutter_test/flutter_test.dart';

// A throwaway self-signed test CA. Its private key was discarded.
const testCaPem = '''
-----BEGIN CERTIFICATE-----
MIIBnjCCAUWgAwIBAgIUaU47BSAuptzwK/rL+dZJ3dqd6nIwCgYIKoZIzj0EAwIw
JDEiMCAGA1UEAwwZRGF5bGkgdGVzdCBkZXZlbG9wbWVudCBDQTAgFw0yNjA5Mjgw
NjM5MTNaGA8yMTI2MDkwNDA2MzkxM1owJDEiMCAGA1UEAwwZRGF5bGkgdGVzdCBk
ZXZlbG9wbWVudCBDQTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABCxzgSYup9nL
xmkjxWN6NQ768U8gsDOQWI4QJZrKQi0HiSeGkvFtlbh4rjzwIrIzcSBxSoG1bhEv
XbAkHIOQ0kmjUzBRMB0GA1UdDgQWBBRv0mdKdzZ0Cjb1+rjv2xIS+aFoBTAfBgNV
HSMEGDAWgBRv0mdKdzZ0Cjb1+rjv2xIS+aFoBTAPBgNVHRMBAf8EBTADAQH/MAoG
CCqGSM49BAMCA0cAMEQCIGa7soZkrJUHEIqjpD/jGjbuZd3vgnKz8x9wYuqzDMK9
AiBZwapPW5fyxqGaSGxmW3R5hc5RIwxjmbtmOUWk9Gkqag==
-----END CERTIFICATE-----
''';

String encode(String pem) => base64.encode(utf8.encode(pem));

void main() {
  test('returns one PEM certificate in debug builds', () {
    expect(
      developmentCaBytes(encode(testCaPem), debugMode: true),
      utf8.encode(testCaPem),
    );
  });

  test('accepts wrapped base64 output', () {
    final wrapped = encode(
      testCaPem,
    ).replaceAllMapped(RegExp('.{76}'), (match) => '${match[0]}\n');

    expect(
      developmentCaBytes(wrapped, debugMode: true),
      utf8.encode(testCaPem),
    );
  });

  test('a security context accepts the certificate', () {
    final ca = developmentCaBytes(encode(testCaPem), debugMode: true)!;

    expect(
      () =>
          SecurityContext(withTrustedRoots: false)
            ..setTrustedCertificatesBytes(ca),
      returnsNormally,
    );
  });

  test('returns nothing outside debug builds', () {
    expect(developmentCaBytes(encode(testCaPem), debugMode: false), isNull);
  });

  test('returns nothing when no certificate is configured', () {
    expect(developmentCaBytes('', debugMode: true), isNull);
  });

  test('rejects invalid base64', () {
    expect(
      () => developmentCaBytes('not base64!', debugMode: true),
      throwsFormatException,
    );
  });

  test('rejects content without exactly one certificate', () {
    for (final pem in ['not a certificate', '$testCaPem$testCaPem']) {
      expect(
        () => developmentCaBytes(encode(pem), debugMode: true),
        throwsFormatException,
      );
    }
  });

  test('rejects a bundled private key', () {
    const key =
        '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n';

    expect(
      () => developmentCaBytes(encode('$testCaPem$key'), debugMode: true),
      throwsFormatException,
    );
  });
}

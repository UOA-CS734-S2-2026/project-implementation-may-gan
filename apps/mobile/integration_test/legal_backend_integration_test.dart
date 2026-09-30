import 'dart:convert';
import 'dart:io';

import 'package:dayli_mobile/api/feed_client.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/api/posting_day_client.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/app/development_ca.dart';
import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/drafts/draft_store.dart';
import 'package:dayli_mobile/messaging/messaging_client.dart';
import 'package:dayli_mobile/messaging/messaging_controller.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:http/http.dart' as http;

const _apiOrigin = String.fromEnvironment('DAYLI_E2E_API_BASE_URL');
const _developmentCa = String.fromEnvironment(developmentCaDefine);

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'uses Better Auth and a disposable backend for legal navigation',
    (tester) async {
      if (_apiOrigin.isEmpty) {
        throw StateError('DAYLI_E2E_API_BASE_URL is required for this test.');
      }
      final ca = developmentCaBytes(_developmentCa, debugMode: true);
      if (ca == null) {
        throw StateError('$developmentCaDefine is required for this test.');
      }
      SecurityContext.defaultContext.setTrustedCertificatesBytes(ca);

      final storage = FlutterSecureStorage();
      final tokens = ProtectedSessionTokenStore(storage: storage);
      final users = ProtectedSessionUserCache(storage);
      final drafts = ProtectedDraftStore(storage: storage);
      await _clearSession(tokens, users);

      final suffix = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
      final username = 'native$suffix';
      final email = '$username@example.test';
      const password = 'native-e2e-password-123';

      await tester.pumpWidget(
        DayliApp(
          services: _actualServices(_apiOrigin, tokens, users, drafts),
          useGoogleFonts: false,
        ),
      );
      await _waitFor(tester, find.byKey(const Key('landing.sign-up')));

      await tester.tap(find.byKey(const Key('landing.sign-up')));
      await _waitFor(tester, find.byKey(const Key('auth.username')));
      await tester.enterText(find.byKey(const Key('auth.username')), username);
      await tester.enterText(find.byKey(const Key('auth.email')), email);
      await tester.enterText(find.byKey(const Key('auth.password')), password);
      await tester.tap(find.byKey(const Key('auth.submit')));
      await _waitFor(tester, find.byKey(const Key('shell.profile')));

      await tester.tap(find.byKey(const Key('shell.profile')));
      await _waitFor(tester, find.text('settings'));
      await _openLegalFromSettings(tester, const Key('legal.openPrivacy'));
      await _waitFor(tester, find.text('Privacy Policy'));
      expect(find.text('Privacy Policy'), findsOneWidget);
      expect(find.byKey(const Key('legal.draftNotice')), findsOneWidget);
      await _tapLegalBack(tester, 'privacy');
      await _waitFor(tester, find.byKey(const Key('legal.openPrivacy')));
      await _openLegalFromSettings(tester, const Key('legal.openTerms'));
      await _waitFor(tester, find.text('Terms of Service'));
      expect(find.text('Terms of Service'), findsOneWidget);
      await _tapLegalBack(tester, 'terms');
      await _waitFor(tester, find.byKey(const Key('legal.openTerms')));

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await tester.pumpWidget(
        DayliApp(
          services: _actualServices(_apiOrigin, tokens, users, drafts),
          useGoogleFonts: false,
        ),
      );
      await _waitFor(tester, find.byKey(const Key('shell.profile')));

      await tester.tap(find.byKey(const Key('shell.profile')));
      await _waitFor(tester, find.text('settings'));
      await tester.ensureVisible(find.byKey(const Key('settings.signOut')));
      final firstBearer = await _verifiedBearer(tokens);
      await tester.tap(find.byKey(const Key('settings.signOut')));
      await _waitFor(tester, find.byKey(const Key('landing.sign-in')));
      expect(await tokens.readPendingRevocation(), isNull);
      expect(await _serverRecognizesBearer(firstBearer), isFalse);

      await tester.tap(find.byKey(const Key('legal.openTerms')));
      await _waitFor(tester, find.text('Terms of Service'));
      await _tapLegalBack(tester, 'terms');
      await _waitFor(tester, find.byKey(const Key('landing.sign-in')));

      await tester.tap(find.byKey(const Key('landing.sign-in')));
      await _waitFor(tester, find.byKey(const Key('auth.email')));
      await tester.enterText(find.byKey(const Key('auth.email')), email);
      await tester.enterText(find.byKey(const Key('auth.password')), password);
      await tester.tap(find.byKey(const Key('legal.openPrivacy')));
      await _waitFor(tester, find.text('Privacy Policy'));
      await _tapLegalBack(tester, 'privacy');
      await _waitFor(tester, find.byKey(const Key('auth.email')));
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('auth.email')))
            .controller!
            .text,
        email,
      );
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('auth.password')))
            .controller!
            .text,
        password,
      );

      await tester.tap(find.byKey(const Key('auth.submit')));
      await _waitForSignedIn(tester);
      await tester.tap(find.byKey(const Key('shell.profile')));
      await _waitFor(tester, find.text('settings'));
      await tester.ensureVisible(find.byKey(const Key('settings.signOut')));
      final secondBearer = await _verifiedBearer(tokens);
      await tester.tap(find.byKey(const Key('settings.signOut')));
      await _waitFor(tester, find.byKey(const Key('landing.sign-in')));
      expect(await _serverRecognizesBearer(secondBearer), isFalse);

      await _clearSession(tokens, users);
    },
  );
}

Future<String> _verifiedBearer(ProtectedSessionTokenStore tokens) async {
  final bearer = await tokens.read();
  if (bearer == null || bearer.isEmpty) {
    throw TestFailure('Expected a stored bearer before sign-out.');
  }
  expect(await _serverRecognizesBearer(bearer), isTrue);
  return bearer;
}

Future<bool> _serverRecognizesBearer(String bearer) async {
  final client = http.Client();
  try {
    final response = await client.get(
      Uri.parse('$_apiOrigin/api/auth/get-session'),
      headers: {'Authorization': 'Bearer $bearer'},
    );
    if (response.statusCode == 401) return false;
    if (response.statusCode != 200) {
      throw TestFailure(
        'Unexpected session-check status: ${response.statusCode}.',
      );
    }
    final Object? body;
    try {
      body = jsonDecode(response.body);
    } on FormatException {
      throw TestFailure('Session check did not return valid JSON.');
    }
    if (body == null) return false;
    if (body is Map && body['session'] is Map && body['user'] is Map) {
      return true;
    }
    throw TestFailure('Unexpected session-check response shape.');
  } finally {
    client.close();
  }
}

Future<void> _tapLegalBack(WidgetTester tester, String documentId) async {
  await tester.tap(
    find.descendant(
      of: find.byKey(Key('legal.$documentId.scroll')),
      matching: find.byTooltip('Back'),
    ),
  );
}

Future<void> _openLegalFromSettings(WidgetTester tester, Key key) async {
  final link = find.byKey(key);
  await tester.ensureVisible(link);
  await tester.tap(link);
  await tester.pump();
}

Future<void> _waitForSignedIn(WidgetTester tester) async {
  final profile = find.byKey(const Key('shell.profile'));
  final error = find.byKey(const Key('auth.error'));
  for (var attempt = 0; attempt < 40; attempt += 1) {
    await tester.pump(const Duration(milliseconds: 250));
    if (profile.evaluate().isNotEmpty) return;
    if (error.evaluate().isNotEmpty) {
      final message = tester.widget<Text>(error).data;
      throw TestFailure('Real Better Auth sign-in failed: $message');
    }
  }
  throw TestFailure('Timed out waiting for the signed-in app shell.');
}

Future<void> _waitFor(WidgetTester tester, Finder finder) async {
  for (var attempt = 0; attempt < 40; attempt += 1) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure('Timed out waiting for $finder.');
}

Future<void> _clearSession(
  ProtectedSessionTokenStore tokens,
  ProtectedSessionUserCache users,
) async {
  await tokens.clear();
  await tokens.clearPendingRevocation();
  await users.clear();
}

AppServices _actualServices(
  String baseUrl,
  ProtectedSessionTokenStore tokens,
  ProtectedSessionUserCache users,
  ProtectedDraftStore drafts,
) {
  final nativeSession = BetterAuthNativeSession(
    baseUrl: baseUrl,
    tokenStore: tokens,
  );
  final messaging = MessagingController(
    HttpMessagingClient(
      baseUrl: baseUrl,
      bearerToken: nativeSession.bearerToken,
    ),
  );
  final session = SessionController(
    session: nativeSession,
    tokenStore: tokens,
    userCache: users,
    drafts: drafts,
    // Realtime has a separate transport fixture. This journey keeps the real
    // session, router, stores, generated clients, and Better Auth backend.
    onSignedIn: (_) async {},
    onPrivateDataClear: () async {
      await messaging.stopRealtime();
      messaging.clear();
    },
  );
  return AppServices(
    session: session,
    postingDays: GeneratedPostingDayClient(
      baseUrl: baseUrl,
      bearerToken: nativeSession.bearerToken,
    ),
    feed: GeneratedFeedClient(
      baseUrl: baseUrl,
      bearerToken: nativeSession.bearerToken,
    ),
    posts: GeneratedPostClient(
      baseUrl: baseUrl,
      bearerToken: nativeSession.bearerToken,
    ),
    friends: GeneratedFriendsClient(
      baseUrl: baseUrl,
      bearerToken: nativeSession.bearerToken,
    ),
    drafts: drafts,
    messaging: messaging,
    submitter: GeneratedPostSubmitter(
      baseUrl: baseUrl,
      bearerToken: nativeSession.bearerToken,
    ),
  );
}

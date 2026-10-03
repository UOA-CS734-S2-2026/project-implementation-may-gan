import 'dart:convert';
import 'dart:io';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/api/profile_client.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:integration_test/integration_test.dart';

import '../test/support/fakes.dart';

const _apiBaseUrl = String.fromEnvironment('DPP004_API_BASE_URL');
const _publicUsername = String.fromEnvironment('DPP004_PUBLIC_USERNAME');
const _privateUsername = String.fromEnvironment('DPP004_PRIVATE_USERNAME');
const _publicPostId = String.fromEnvironment('DPP004_PUBLIC_POST_ID');
const _privatePostId = String.fromEnvironment('DPP004_PRIVATE_POST_ID');
const _viewerEmail = String.fromEnvironment('DPP004_VIEWER_EMAIL');
const _viewerPassword = String.fromEnvironment('DPP004_VIEWER_PASSWORD');
const _viewerToken = String.fromEnvironment('DPP004_VIEWER_TOKEN');
const _expiredToken = String.fromEnvironment('DPP004_EXPIRED_TOKEN');
const _secondViewerEmail = String.fromEnvironment('DPP004_SECOND_VIEWER_EMAIL');
const _secondViewerPassword = String.fromEnvironment(
  'DPP004_SECOND_VIEWER_PASSWORD',
);
const _secondViewerToken = String.fromEnvironment('DPP004_SECOND_VIEWER_TOKEN');
const _caPemBase64 = String.fromEnvironment('DPP004_CA_PEM_B64');
const _fixtureReady =
    _apiBaseUrl != '' &&
    _publicUsername != '' &&
    _privateUsername != '' &&
    _publicPostId != '' &&
    _privatePostId != '' &&
    _viewerEmail != '' &&
    _viewerPassword != '' &&
    _viewerToken != '' &&
    _expiredToken != '' &&
    _secondViewerEmail != '' &&
    _secondViewerPassword != '' &&
    _secondViewerToken != '' &&
    _caPemBase64 != '';

void trustFixtureCertificate() {
  SecurityContext.defaultContext.setTrustedCertificatesBytes(
    base64Decode(_caPemBase64),
  );
}

({AppServices services, MemoryTokenStore tokens}) realReadServices({
  String? token,
}) {
  final tokens = MemoryTokenStore()..value = token;
  final drafts = MemoryDraftStore();
  final session = SessionController(
    session: BetterAuthNativeSession(baseUrl: _apiBaseUrl, tokenStore: tokens),
    tokenStore: tokens,
    userCache: MemoryUserCache(),
    drafts: drafts,
  );
  return (
    services: AppServices(
      session: session,
      postingDays: FakePostingDayClient(ApiSuccess(postingDay())),
      feed: FakeFeedClient(),
      posts: GeneratedPostClient(
        baseUrl: _apiBaseUrl,
        bearerToken: session.bearerToken,
      ),
      friends: GeneratedFriendsClient(
        baseUrl: _apiBaseUrl,
        bearerToken: session.bearerToken,
      ),
      profiles: GeneratedProfileClient(
        baseUrl: _apiBaseUrl,
        bearerToken: session.bearerToken,
      ),
      drafts: drafts,
      submitter: FakeSubmitter(
        const SubmissionAccepted(postId: 'unused', replayed: false),
      ),
    ),
    tokens: tokens,
  );
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'anonymous native deep links use real isolated public projections',
    (tester) async {
      trustFixtureCertificate();
      final services = realReadServices().services;
      await tester.pumpWidget(
        DayliApp(
          services: services,
          useGoogleFonts: false,
          initialLocation: '/u/$_publicUsername',
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.text('@$_publicUsername'), findsWidgets);
      expect(find.byKey(const Key('profile.private')), findsNothing);
      expect(find.text('Synthetic released dayli.'), findsOneWidget);

      final router = GoRouter.of(
        tester.element(find.byKey(const Key('profile.username'))),
      );
      router.go('/u/$_privateUsername');
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.text('@$_privateUsername'), findsOneWidget);
      expect(find.text('This profile is private.'), findsOneWidget);
      expect(find.byKey(const Key('profile.avatar')), findsNothing);

      router.go('/posts/$_publicPostId');
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('post.unavailable')), findsNothing);
      expect(find.text('Synthetic released dayli.'), findsOneWidget);
      expect(find.byKey(const Key('post.like')), findsOneWidget);

      final detailResult = await services.posts.get(_publicPostId);
      expect(detailResult, isA<ApiSuccess<PostDetail>>());
      final detail = (detailResult as ApiSuccess<PostDetail>).value;
      expect(detail.media, hasLength(1));
      final mediaUrl = detail.media.single.url;
      expect(mediaUrl, isNotNull);
      final mediaClient = HttpClient();
      addTearDown(() => mediaClient.close(force: true));
      final mediaRequest = await mediaClient.getUrl(mediaUrl!);
      final mediaResponse = await mediaRequest.close();
      final mediaBytes = await mediaResponse.fold<List<int>>(
        <int>[],
        (bytes, chunk) => bytes..addAll(chunk),
      );
      expect(mediaResponse.statusCode, HttpStatus.ok);
      expect(mediaResponse.headers.contentType?.mimeType, 'image/png');
      expect(mediaBytes.take(8), [137, 80, 78, 71, 13, 10, 26, 10]);
    },
    skip: !_fixtureReady,
  );

  testWidgets(
    'password sign-in returns to a refetched finite intent without replay',
    (tester) async {
      trustFixtureCertificate();
      final services = realReadServices().services;
      await tester.pumpWidget(
        DayliApp(
          services: services,
          useGoogleFonts: false,
          initialLocation: '/posts/$_publicPostId',
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      await tester.tap(find.byKey(const Key('post.like')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('auth.email')), _viewerEmail);
      await tester.enterText(
        find.byKey(const Key('auth.password')),
        _viewerPassword,
      );
      await tester.tap(find.byKey(const Key('auth.submit')));
      await tester.pumpAndSettle(const Duration(milliseconds: 100));

      expect(find.byKey(const Key('post.intent')), findsOneWidget);
      expect(
        find.byKey(const Key('post.interactionUnavailable')),
        findsNothing,
      );
    },
    skip: !_fixtureReady,
  );

  testWidgets(
    'failed sign-in keeps a message intent inert until verified authentication',
    (tester) async {
      trustFixtureCertificate();
      final harness = realReadServices();
      final services = harness.services;
      await tester.pumpWidget(
        DayliApp(
          services: services,
          useGoogleFonts: false,
          initialLocation: '/u/$_publicUsername',
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      await tester.ensureVisible(find.byKey(const Key('profile.message')));
      await tester.tap(find.byKey(const Key('profile.message')));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('auth.email')), _viewerEmail);
      await tester.enterText(
        find.byKey(const Key('auth.password')),
        'intentionally-wrong-password',
      );
      await tester.tap(find.byKey(const Key('auth.submit')));
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('auth.error')), findsOneWidget);
      expect(services.session.status, SessionStatus.signedOut);

      harness.tokens.value = _viewerToken;
      await services.session.restore();
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('profile.intent')), findsOneWidget);
      expect(
        find.text('Review and start the message request below.'),
        findsOneWidget,
      );
    },
    skip: !_fixtureReady,
  );

  testWidgets(
    'a server-expired stored bearer retries the public post anonymously',
    (tester) async {
      trustFixtureCertificate();
      final harness = realReadServices(token: _expiredToken);
      await tester.pumpWidget(
        DayliApp(
          services: harness.services,
          useGoogleFonts: false,
          initialLocation: '/posts/$_publicPostId',
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));

      expect(harness.services.session.status, SessionStatus.signedOut);
      expect(find.text('Synthetic released dayli.'), findsOneWidget);
      expect(find.byKey(const Key('post.unavailable')), findsNothing);
    },
    skip: !_fixtureReady,
  );

  testWidgets(
    'blocked access, account replacement, and expiry refetch safely',
    (tester) async {
      trustFixtureCertificate();
      final harness = realReadServices(token: _viewerToken);
      final services = harness.services;
      await services.session.restore();
      final firstViewer = services.session.user!.id;
      await tester.pumpWidget(
        DayliApp(
          services: services,
          useGoogleFonts: false,
          initialLocation: '/posts/$_privatePostId',
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('post.unavailable')), findsOneWidget);

      await services.session.signIn(
        email: _secondViewerEmail,
        password: _secondViewerPassword,
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(services.session.user!.id, isNot(firstViewer));
      expect(find.byKey(const Key('post.unavailable')), findsOneWidget);

      await services.session.sessionExpired();
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(services.session.status, SessionStatus.signedOut);
      expect(find.byKey(const Key('post.unavailable')), findsOneWidget);
    },
    skip: !_fixtureReady,
  );
}

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
const _viewerEmail = String.fromEnvironment('DPP004_VIEWER_EMAIL');
const _viewerPassword = String.fromEnvironment('DPP004_VIEWER_PASSWORD');
const _fixtureReady =
    _apiBaseUrl != '' &&
    _publicUsername != '' &&
    _privateUsername != '' &&
    _publicPostId != '' &&
    _viewerEmail != '' &&
    _viewerPassword != '';

AppServices realReadServices() {
  final tokens = MemoryTokenStore();
  final drafts = MemoryDraftStore();
  final session = SessionController(
    session: BetterAuthNativeSession(baseUrl: _apiBaseUrl, tokenStore: tokens),
    tokenStore: tokens,
    userCache: MemoryUserCache(),
    drafts: drafts,
  );
  return AppServices(
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
  );
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'anonymous native deep links use real isolated public projections',
    (tester) async {
      final services = realReadServices();
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

      final router = GoRouter.of(tester.element(find.byType(MaterialApp)));
      router.go('/u/$_privateUsername');
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.text('@$_privateUsername'), findsOneWidget);
      expect(find.text('This profile is private.'), findsOneWidget);
      expect(find.byKey(const Key('profile.avatar')), findsNothing);

      router.go('/posts/$_publicPostId');
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('post.unavailable')), findsNothing);
      expect(find.byKey(const Key('post.like')), findsOneWidget);
    },
    skip: !_fixtureReady,
  );

  testWidgets(
    'password sign-in returns to a refetched finite intent without replay',
    (tester) async {
      final services = realReadServices();
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
}

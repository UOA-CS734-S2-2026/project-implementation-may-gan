import 'dart:convert';
import 'dart:io';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/api/interactions_client.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/api/post_page.dart';
import 'package:dayli_mobile/api/profile_client.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/biometric_service.dart';
import 'package:dayli_mobile/auth/public_return_intent.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/messaging/messaging_client.dart';
import 'package:dayli_mobile/messaging/messaging_controller.dart';
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
const _soloPostId = String.fromEnvironment('DPP005_SOLO_POST_ID');
const _unreleasedPostId = String.fromEnvironment('DPP005_UNRELEASED_POST_ID');
const _authorToken = String.fromEnvironment('DPP004_AUTHOR_TOKEN');
const _authorEmail = String.fromEnvironment('DPP005_AUTHOR_EMAIL');
const _authorPassword = String.fromEnvironment('DPP005_AUTHOR_PASSWORD');
const _viewerEmail = String.fromEnvironment('DPP004_VIEWER_EMAIL');
const _viewerPassword = String.fromEnvironment('DPP004_VIEWER_PASSWORD');
const _viewerToken = String.fromEnvironment('DPP004_VIEWER_TOKEN');
const _expiredToken = String.fromEnvironment('DPP004_EXPIRED_TOKEN');
const _secondViewerToken = String.fromEnvironment('DPP004_SECOND_VIEWER_TOKEN');
const _secondViewerEmail = String.fromEnvironment('DPP005_SECOND_VIEWER_EMAIL');
const _secondViewerPassword = String.fromEnvironment(
  'DPP005_SECOND_VIEWER_PASSWORD',
);
const _caPemBase64 = String.fromEnvironment('DPP004_CA_PEM_B64');
const _replayIntentId = String.fromEnvironment('DPP005_REPLAY_INTENT_ID');
const _replayIssuedAt = int.fromEnvironment('DPP005_REPLAY_ISSUED_AT');
const _fixtureReady =
    _apiBaseUrl != '' &&
    _publicUsername != '' &&
    _privateUsername != '' &&
    _publicPostId != '' &&
    _privatePostId != '' &&
    _soloPostId != '' &&
    _unreleasedPostId != '' &&
    _authorToken != '' &&
    _authorEmail != '' &&
    _authorPassword != '' &&
    _viewerEmail != '' &&
    _viewerPassword != '' &&
    _viewerToken != '' &&
    _expiredToken != '' &&
    _secondViewerToken != '' &&
    _secondViewerEmail != '' &&
    _secondViewerPassword != '' &&
    _caPemBase64 != '' &&
    _replayIntentId != '' &&
    _replayIssuedAt > 0;

Future<void> pumpUntilSession(
  WidgetTester tester,
  SessionController session,
  SessionStatus expected,
) async {
  for (var attempt = 0; attempt < 50 && session.status != expected; attempt++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void trustFixtureCertificate() {
  SecurityContext.defaultContext.setTrustedCertificatesBytes(
    base64Decode(_caPemBase64),
  );
}

({AppServices services, MemoryTokenStore tokens}) realReadServices({
  String? token,
  PublicReturnIntentRegistry? publicReturnIntents,
}) {
  final tokens = MemoryTokenStore()..value = token;
  final drafts = MemoryDraftStore();
  final session = SessionController(
    session: BetterAuthNativeSession(baseUrl: _apiBaseUrl, tokenStore: tokens),
    tokenStore: tokens,
    userCache: MemoryUserCache(),
    drafts: drafts,
    publicReturnIntents: publicReturnIntents,
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
      messaging: MessagingController(
        HttpMessagingClient(
          baseUrl: _apiBaseUrl,
          bearerToken: session.bearerToken,
        ),
      ),
      interactions: GeneratedInteractionsClient(
        baseUrl: _apiBaseUrl,
        bearerToken: session.bearerToken,
      ),
      drafts: drafts,
      submitter: FakeSubmitter(
        const SubmissionAccepted(postId: 'unused', replayed: false),
      ),
      biometric: BiometricService(
        MemoryBiometricPreferenceStore(),
        FakeLocalAuthentication(),
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
      for (final concealedId in [_soloPostId, _unreleasedPostId]) {
        expect(
          await services.posts.get(concealedId),
          isA<ApiError<PostDetail>>(),
        );
      }

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
    'password sign-in returns to like intent and writes only after confirmation',
    (tester) async {
      trustFixtureCertificate();
      final harness = realReadServices();
      final services = harness.services;
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
      await pumpUntilSession(tester, services.session, SessionStatus.signedIn);
      await tester.pumpAndSettle(const Duration(milliseconds: 200));

      expect(services.session.status, SessionStatus.signedIn);
      final before = await services.posts.get(_publicPostId);
      expect(before, isA<ApiSuccess<PostDetail>>());
      expect((before as ApiSuccess<PostDetail>).value.likeCount, 0);
      await tester.tap(find.byKey(const Key('post.like')));
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      final after = await services.posts.get(_publicPostId);
      expect(after, isA<ApiSuccess<PostDetail>>());
      expect((after as ApiSuccess<PostDetail>).value.likeCount, 1);
    },
    skip: !_fixtureReady,
  );

  testWidgets(
    'password sign-in returns to friend intent without sending until tapped',
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
      await tester.tap(find.byKey(const Key('profile.friend')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('auth.email')),
        _secondViewerEmail,
      );
      await tester.enterText(
        find.byKey(const Key('auth.password')),
        _secondViewerPassword,
      );
      await tester.tap(find.byKey(const Key('auth.submit')));
      await pumpUntilSession(tester, services.session, SessionStatus.signedIn);
      await tester.pumpAndSettle(const Duration(milliseconds: 200));
      expect(services.session.status, SessionStatus.signedIn);
      final before = await services.friends.profile(_publicUsername);
      expect(before, isA<ApiSuccess<FriendCard>>());
      expect((before as ApiSuccess<FriendCard>).value.relationship, 'none');
      await tester.tap(find.byKey(const Key('profile.friend')));
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      final after = await services.friends.profile(_publicUsername);
      expect(after, isA<ApiSuccess<FriendCard>>());
      expect(
        (after as ApiSuccess<FriendCard>).value.relationship,
        'outgoingPending',
      );
    },
    skip: !_fixtureReady,
  );

  testWidgets(
    'password sign-in returns to message intent and sends exactly once',
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
      await tester.enterText(
        find.byKey(const Key('auth.email')),
        _secondViewerEmail,
      );
      await tester.enterText(
        find.byKey(const Key('auth.password')),
        _secondViewerPassword,
      );
      await tester.tap(find.byKey(const Key('auth.submit')));
      await pumpUntilSession(tester, services.session, SessionStatus.signedIn);
      await tester.pumpAndSettle(const Duration(milliseconds: 200));
      expect(services.session.status, SessionStatus.signedIn);
      final recipient = await services.friends.profile(_publicUsername);
      expect(recipient, isA<ApiSuccess<FriendCard>>());
      final recipientId = (recipient as ApiSuccess<FriendCard>).value.id;
      final before = await services.messaging.findDirect(recipientId);
      expect(before, isA<ApiSuccess<String?>>());
      expect((before as ApiSuccess<String?>).value, isNull);
      await tester.ensureVisible(find.byKey(const Key('profile.message')));
      await tester.tap(find.byKey(const Key('profile.message')));
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      await tester.enterText(
        find.byType(TextField),
        'Explicit native message.',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Send'));
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle(const Duration(milliseconds: 200));
      expect(services.messaging.failure, isNull);
      final after = await services.messaging.findDirect(recipientId);
      expect(after, isA<ApiSuccess<String?>>());
      final conversationId = (after as ApiSuccess<String?>).value;
      expect(conversationId, isNotNull);
      await services.messaging.loadConversation(conversationId!);
      final sent = services.messaging
          .thread(conversationId)
          .where(
            (message) =>
                message.senderId == services.session.user!.id &&
                message.text == 'Explicit native message.',
          );
      expect(sent, hasLength(1));
      expect(sent.single.clientMessageId, isNotEmpty);
    },
    skip: !_fixtureReady,
  );

  testWidgets(
    'password sign-in returns to comment intent and posts only after send',
    (tester) async {
      trustFixtureCertificate();
      final harness = realReadServices();
      final services = harness.services;
      await tester.pumpWidget(
        DayliApp(
          services: services,
          useGoogleFonts: false,
          initialLocation: '/posts/$_publicPostId',
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      await tester.tap(find.byKey(const Key('post.comment')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('auth.email')), _viewerEmail);
      await tester.enterText(
        find.byKey(const Key('auth.password')),
        _viewerPassword,
      );
      await tester.tap(find.byKey(const Key('auth.submit')));
      await pumpUntilSession(tester, services.session, SessionStatus.signedIn);
      await tester.pumpAndSettle(const Duration(milliseconds: 200));
      expect(services.session.status, SessionStatus.signedIn);
      final before = await services.posts.get(_publicPostId);
      expect(before, isA<ApiSuccess<PostDetail>>());
      expect((before as ApiSuccess<PostDetail>).value.commentCount, 0);
      await tester.enterText(
        find.byKey(const Key('comments.input')),
        'Explicit native comment.',
      );
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('comments.send')));
      await tester.tap(find.byKey(const Key('comments.send')));
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      final after = await services.posts.get(_publicPostId);
      expect(after, isA<ApiSuccess<PostDetail>>());
      expect((after as ApiSuccess<PostDetail>).value.commentCount, 1);
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
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
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
    'account replacement closes an author editor before the new actor renders',
    (tester) async {
      trustFixtureCertificate();
      final harness = realReadServices(token: _authorToken);
      final services = harness.services;
      await services.session.restore();
      final authorId = services.session.user!.id;
      await tester.pumpWidget(
        DayliApp(
          services: services,
          useGoogleFonts: false,
          initialLocation: '/posts/$_publicPostId',
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));

      await tester.tap(find.byKey(const Key('post.menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('post.edit')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('editPost.answer')),
        'Author-only unsaved overlay text.',
      );
      expect(find.text('Author-only unsaved overlay text.'), findsOneWidget);

      harness.tokens.value = _secondViewerToken;
      await services.session.restore();
      await tester.pumpAndSettle(const Duration(milliseconds: 100));

      expect(services.session.user!.id, isNot(authorId));
      expect(find.byKey(const Key('editPost.save')), findsNothing);
      expect(find.text('Author-only unsaved overlay text.'), findsNothing);
      expect(find.text('Synthetic released dayli.'), findsOneWidget);
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
    'a known viewer loses loaded public post and media access after a real block',
    (tester) async {
      trustFixtureCertificate();
      final viewer = realReadServices(token: _viewerToken);
      await viewer.services.session.restore();
      final viewerId = viewer.services.session.user!.id;
      final loaded = await viewer.services.posts.get(_publicPostId);
      expect(loaded, isA<ApiSuccess<PostDetail>>());
      final mediaId = (loaded as ApiSuccess<PostDetail>).value.media.single.id;
      final mediaUrl = Uri.parse(
        '$_apiBaseUrl/api/v1/posts/$_publicPostId/media/$mediaId/content',
      );
      await tester.pumpWidget(
        DayliApp(
          services: viewer.services,
          useGoogleFonts: false,
          initialLocation: '/posts/$_publicPostId',
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.text('Synthetic released dayli.'), findsOneWidget);
      expect(find.byKey(const Key('post.photo.0')), findsOneWidget);
      expect(find.byKey(const Key('post.commentCount')), findsOneWidget);

      final blockClient = HttpClient();
      addTearDown(() => blockClient.close(force: true));
      final request = await blockClient.postUrl(
        Uri.parse('$_apiBaseUrl/api/v1/relationships/$viewerId/block'),
      );
      request.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer $_authorToken',
      );
      final response = await request.close();
      await response.drain<void>();
      expect(response.statusCode, HttpStatus.ok);

      expect(
        await viewer.services.posts.get(_publicPostId),
        isA<ApiError<PostDetail>>(),
      );
      expect(
        await viewer.services.posts.profilePage(_publicUsername),
        isA<ApiError<ProfilePostsPage>>(),
      );
      expect(
        await viewer.services.posts.revisions(_publicPostId),
        isA<ApiError<PostPage<PostRevision>>>(),
      );
      expect(
        await viewer.services.interactions.comments(_publicPostId),
        isA<ApiError<PostPage<PostComment>>>(),
      );
      expect(
        await viewer.services.interactions.likes(_publicPostId),
        isA<ApiError<PostPage<PostLike>>>(),
      );
      tester.element(find.byType(Scaffold).first).go('/u/$_publicUsername');
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.text('Synthetic released dayli.'), findsNothing);
      expect(find.byKey(const Key('post.photo.0')), findsNothing);
      tester.element(find.byType(Scaffold).first).go('/posts/$_publicPostId');
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('post.unavailable')), findsOneWidget);
      expect(find.text('Synthetic released dayli.'), findsNothing);
      expect(find.byKey(const Key('post.photo.0')), findsNothing);
      expect(find.byKey(const Key('post.commentCount')), findsNothing);
      final mediaRequest = await blockClient.getUrl(mediaUrl);
      mediaRequest.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer $_viewerToken',
      );
      final mediaResponse = await mediaRequest.close();
      await mediaResponse.drain<void>();
      expect(mediaResponse.statusCode, HttpStatus.notFound);
    },
    skip: !_fixtureReady,
  );

  testWidgets(
    'blocked access, friend eligibility, account replacement, and expiry refetch safely',
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

      harness.tokens.value = _secondViewerToken;
      await services.session.restore();
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(services.session.user!.id, isNot(firstViewer));
      expect(find.byKey(const Key('post.unavailable')), findsNothing);
      expect(find.text('Blocked private dayli.'), findsOneWidget);

      await services.session.sessionExpired();
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(services.session.status, SessionStatus.signedOut);
      expect(find.byKey(const Key('post.unavailable')), findsOneWidget);
    },
    skip: !_fixtureReady,
  );

  testWidgets(
    'consumes the externally recorded native return URL after real sign-in',
    (tester) async {
      trustFixtureCertificate();
      final registry = PublicReturnIntentRegistry(
        clock: () =>
            DateTime.fromMillisecondsSinceEpoch(_replayIssuedAt, isUtc: true),
        tokenFactory: () => _replayIntentId,
      );
      final harness = realReadServices(publicReturnIntents: registry);
      await tester.pumpWidget(
        DayliApp(
          services: harness.services,
          useGoogleFonts: false,
          initialLocation: '/posts/$_publicPostId',
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      await tester.tap(find.byKey(const Key('post.comment')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('auth.email')), _authorEmail);
      await tester.enterText(
        find.byKey(const Key('auth.password')),
        _authorPassword,
      );
      await tester.tap(find.byKey(const Key('auth.submit')));
      await pumpUntilSession(
        tester,
        harness.services.session,
        SessionStatus.signedIn,
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 200));
      expect(harness.services.session.status, SessionStatus.signedIn);
      expect(find.byKey(const Key('comments.input')), findsOneWidget);
      expect(
        registry.consumePublic(
          Uri.parse(
            '/posts/$_publicPostId?action=comment&intentId=$_replayIntentId&issuedAt=$_replayIssuedAt&origin=anonymous',
          ),
          actorId: harness.services.session.user!.id,
        ),
        isNull,
      );
    },
    skip: !_fixtureReady,
  );

  testWidgets(
    'cold restart rejects the externally recorded consumed intent URL',
    (tester) async {
      trustFixtureCertificate();
      final harness = realReadServices(token: _authorToken);
      await harness.services.session.restore();
      await tester.pumpWidget(
        DayliApp(
          services: harness.services,
          useGoogleFonts: false,
          initialLocation:
              '/posts/$_publicPostId?action=comment&intentId=$_replayIntentId&issuedAt=$_replayIssuedAt&origin=anonymous',
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.text('Synthetic released dayli.'), findsOneWidget);
      expect(find.byKey(const Key('comments.input')), findsOneWidget);
      expect(
        FocusManager.instance.primaryFocus?.context?.widget.key,
        isNot(const Key('comments.input')),
      );
    },
    skip: !_fixtureReady,
  );

  testWidgets(
    'public to private transition withdraws anonymous detail, archive, and media',
    (tester) async {
      trustFixtureCertificate();
      final anonymous = realReadServices();
      await tester.pumpWidget(
        DayliApp(
          services: anonymous.services,
          useGoogleFonts: false,
          initialLocation: '/posts/$_publicPostId',
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.text('Synthetic released dayli.'), findsOneWidget);
      final before = await anonymous.services.posts.get(_publicPostId);
      expect(before, isA<ApiSuccess<PostDetail>>());
      final mediaUrl =
          (before as ApiSuccess<PostDetail>).value.media.single.url!;

      final author = realReadServices(token: _authorToken);
      await author.services.session.restore();
      final changed = await author.services.profiles.update(isPrivate: true);
      expect(changed, isA<ApiSuccess<ProfileDetails>>());

      expect(
        await anonymous.services.posts.get(_publicPostId),
        isA<ApiError<PostDetail>>(),
      );
      tester.element(find.byType(Scaffold).first).go('/u/$_publicUsername');
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.text('Synthetic released dayli.'), findsNothing);
      expect(find.text('This profile is private.'), findsOneWidget);
      tester.element(find.byType(Scaffold).first).go('/posts/$_publicPostId');
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.text('Synthetic released dayli.'), findsNothing);
      expect(find.byKey(const Key('post.unavailable')), findsOneWidget);
      final mediaClient = HttpClient();
      final archiveRequest = await mediaClient.getUrl(
        Uri.parse('$_apiBaseUrl/api/v1/profiles/$_publicUsername/posts'),
      );
      final archiveResponse = await archiveRequest.close();
      final archiveBody = await archiveResponse.transform(utf8.decoder).join();
      expect(archiveResponse.statusCode, HttpStatus.ok);
      expect(jsonDecode(archiveBody), {
        'kind': 'restricted',
        'username': _publicUsername,
      });
      addTearDown(() => mediaClient.close(force: true));
      final request = await mediaClient.getUrl(mediaUrl);
      final response = await request.close();
      await response.drain<void>();
      expect(response.statusCode, HttpStatus.notFound);
    },
    skip: !_fixtureReady,
  );
}

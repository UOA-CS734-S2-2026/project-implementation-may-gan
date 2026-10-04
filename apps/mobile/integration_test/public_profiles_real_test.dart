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
const _soloPostId = String.fromEnvironment('DPP005_SOLO_POST_ID');
const _unreleasedPostId = String.fromEnvironment('DPP005_UNRELEASED_POST_ID');
const _authorToken = String.fromEnvironment('DPP004_AUTHOR_TOKEN');
const _viewerEmail = String.fromEnvironment('DPP004_VIEWER_EMAIL');
const _viewerPassword = String.fromEnvironment('DPP004_VIEWER_PASSWORD');
const _viewerToken = String.fromEnvironment('DPP004_VIEWER_TOKEN');
const _expiredToken = String.fromEnvironment('DPP004_EXPIRED_TOKEN');
const _secondViewerToken = String.fromEnvironment('DPP004_SECOND_VIEWER_TOKEN');
const _caPemBase64 = String.fromEnvironment('DPP004_CA_PEM_B64');
const _fixtureReady =
    _apiBaseUrl != '' &&
    _publicUsername != '' &&
    _privateUsername != '' &&
    _publicPostId != '' &&
    _privatePostId != '' &&
    _soloPostId != '' &&
    _unreleasedPostId != '' &&
    _authorToken != '' &&
    _viewerEmail != '' &&
    _viewerPassword != '' &&
    _viewerToken != '' &&
    _expiredToken != '' &&
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
    'verified sign-in returns to a refetched finite intent without replay',
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
      harness.tokens.value = _viewerToken;
      await services.session.restore();
      await tester.pumpAndSettle(const Duration(milliseconds: 100));

      expect(services.session.status, SessionStatus.signedIn);
      expect(
        find.byKey(const Key('post.interactionUnavailable')),
        findsNothing,
      );
      final before = await services.posts.get(_publicPostId);
      expect(before, isA<ApiSuccess<PostDetail>>());
      expect((before as ApiSuccess<PostDetail>).value.likeCount, 0);
      expect(before.value.commentCount, 0);

      final liked = await services.interactions.setLike(
        _publicPostId,
        liked: true,
      );
      expect(liked, isA<ApiSuccess<LikeSummary>>());
      final commented = await services.interactions.createComment(
        _publicPostId,
        clientCommentId: '11111111-1111-4111-8111-111111111111',
        text: 'Explicit native comment.',
      );
      expect(commented, isA<ApiSuccess<PostComment>>());

      final after = await services.posts.get(_publicPostId);
      expect(after, isA<ApiSuccess<PostDetail>>());
      expect((after as ApiSuccess<PostDetail>).value.likeCount, 1);
      expect(after.value.commentCount, 1);
      final comments = await services.interactions.comments(_publicPostId);
      expect(comments, isA<ApiSuccess<PostPage<PostComment>>>());
      expect(
        (comments as ApiSuccess<PostPage<PostComment>>).value.items.where(
          (comment) => comment.text == 'Explicit native comment.',
        ),
        hasLength(1),
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
    'public to private transition withdraws anonymous detail, archive, and media',
    (tester) async {
      trustFixtureCertificate();
      final anonymous = realReadServices();
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

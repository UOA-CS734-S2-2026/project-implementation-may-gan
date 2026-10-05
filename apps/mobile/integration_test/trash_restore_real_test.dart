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
import 'package:dayli_mobile/app/theme.dart';
import 'package:dayli_mobile/auth/biometric_service.dart';
import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
import 'package:dayli_mobile/settings/trash_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:integration_test/integration_test.dart';

import '../test/support/fakes.dart';

const _apiBaseUrl = String.fromEnvironment('DPP004_API_BASE_URL');
const _authorToken = String.fromEnvironment('DPP004_AUTHOR_TOKEN');
const _publicPostId = String.fromEnvironment('DPP004_PUBLIC_POST_ID');
const _publicUsername = String.fromEnvironment('DPP004_PUBLIC_USERNAME');
const _conflictPostId = String.fromEnvironment('DPP005_CONFLICT_POST_ID');
const _caPemBase64 = String.fromEnvironment('DPP004_CA_PEM_B64');
const _fixtureReady =
    _apiBaseUrl != '' &&
    _authorToken != '' &&
    _publicPostId != '' &&
    _publicUsername != '' &&
    _conflictPostId != '' &&
    _caPemBase64 != '';

AppServices realTrashServices() {
  final tokens = MemoryTokenStore()..value = _authorToken;
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
  );
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'owner uses real Worker Trash list and restore, while replacement conflicts stay trashed',
    (tester) async {
      SecurityContext.defaultContext.setTrustedCertificatesBytes(
        base64Decode(_caPemBase64),
      );
      final services = realTrashServices();
      await services.session.restore();
      expect(services.session.status, SessionStatus.signedIn);

      await tester.pumpWidget(
        DayliApp(
          services: services,
          useGoogleFonts: false,
          initialLocation: '/posts/$_publicPostId',
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.text('Synthetic released dayli.'), findsOneWidget);
      expect(find.byKey(const Key('post.photo.0')), findsOneWidget);
      expect(find.byKey(const Key('post.commentCount')), findsOneWidget);

      final beforeTrash = await services.posts.get(_publicPostId);
      expect(beforeTrash, isA<ApiSuccess<PostDetail>>());
      final mediaId =
          (beforeTrash as ApiSuccess<PostDetail>).value.media.single.id;
      expect(
        await services.posts.profilePage(_publicUsername),
        isA<ApiSuccess<ProfilePostsPage>>(),
      );
      expect(
        await services.posts.revisions(_publicPostId),
        isA<ApiSuccess<PostPage<PostRevision>>>(),
      );
      expect(
        await services.interactions.comments(_publicPostId),
        isA<ApiSuccess<PostPage<PostComment>>>(),
      );
      expect(
        await services.interactions.likes(_publicPostId),
        isA<ApiSuccess<PostPage<PostLike>>>(),
      );

      final moved = await services.posts.delete(_publicPostId);
      expect(moved, isA<ApiSuccess<void>>());
      expect(
        await services.posts.get(_publicPostId),
        isA<ApiError<PostDetail>>(),
      );
      final archiveAfterTrash = await services.posts.profilePage(
        _publicUsername,
      );
      expect(archiveAfterTrash, isA<ApiSuccess<ProfilePostsPage>>());
      expect(
        (archiveAfterTrash as ApiSuccess<ProfilePostsPage>).value.items.where(
          (post) => post.id == _publicPostId,
        ),
        isEmpty,
      );
      expect(
        await services.posts.revisions(_publicPostId),
        isA<ApiError<PostPage<PostRevision>>>(),
      );
      expect(
        await services.interactions.comments(_publicPostId),
        isA<ApiError<PostPage<PostComment>>>(),
      );
      expect(
        await services.interactions.likes(_publicPostId),
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

      final mediaClient = HttpClient();
      addTearDown(() => mediaClient.close(force: true));
      final mediaRequest = await mediaClient.getUrl(
        Uri.parse(
          '$_apiBaseUrl/api/v1/posts/$_publicPostId/media/$mediaId/content',
        ),
      );
      mediaRequest.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer $_authorToken',
      );
      final mediaResponse = await mediaRequest.close();
      await mediaResponse.drain<void>();
      expect(mediaResponse.statusCode, HttpStatus.notFound);
      final listed = await services.postTrash.listTrash();
      expect(listed, isA<ApiSuccess<List<TrashedPost>>>());
      final listedIds = (listed as ApiSuccess<List<TrashedPost>>).value.map(
        (post) => post.id,
      );
      expect(listedIds, containsAll([_publicPostId, _conflictPostId]));

      await tester.pumpWidget(
        AppScope(
          services: services,
          child: MaterialApp(
            theme: buildDayliTheme(useGoogleFonts: false),
            home: const TrashScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));

      final publicCard = find.byKey(Key('trash.$_publicPostId.1'));
      expect(publicCard, findsOneWidget);
      await tester.tap(
        find.descendant(of: publicCard, matching: find.text('Restore')),
      );
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(
        await services.posts.get(_publicPostId),
        isA<ApiSuccess<PostDetail>>(),
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      expect(publicCard, findsNothing);

      final directConflict = await services.postTrash.restore(_conflictPostId);
      expect(directConflict, isA<ApiError<void>>());
      expect(
        (directConflict as ApiError<void>).failure,
        isA<Conflict>().having(
          (failure) => failure.reason,
          'reason',
          'day_occupied',
        ),
      );

      final conflictCard = find.byKey(Key('trash.$_conflictPostId.1'));
      expect(conflictCard, findsOneWidget);
      final afterConflict = await services.postTrash.listTrash();
      expect(afterConflict, isA<ApiSuccess<List<TrashedPost>>>());
      expect(
        (afterConflict as ApiSuccess<List<TrashedPost>>).value.map(
          (post) => post.id,
        ),
        contains(_conflictPostId),
      );
    },
    skip: !_fixtureReady,
  );
}

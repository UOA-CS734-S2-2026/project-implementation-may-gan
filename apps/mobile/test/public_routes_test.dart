import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/api/profile_client.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/public_return_intent.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

class LiveGoogleProvider implements GoogleIdTokenProvider {
  int calls = 0;

  @override
  Future<String> authenticate() async {
    calls++;
    return 'verified-provider-id-token';
  }
}

class ControlledPostClient extends FakePostClient {
  final pending = <Completer<ApiResult<PostDetail>>>[];

  @override
  Future<ApiResult<PostDetail>> get(String postId) {
    requested.add(postId);
    final completer = Completer<ApiResult<PostDetail>>();
    pending.add(completer);
    return completer.future;
  }
}

class ControlledProfileClient extends FakeProfileClient {
  final pending = <Completer<ApiResult<ProfileDetails>>>[];

  @override
  Future<ApiResult<ProfileDetails>> details(String username) {
    requested.add(username);
    final completer = Completer<ApiResult<ProfileDetails>>();
    pending.add(completer);
    return completer.future;
  }
}

class IntentFriendsClient extends FakeFriendsClient {
  final sent = <String>[];

  @override
  Future<ApiResult<FriendCard>> profile(String username) async => ApiSuccess(
    FriendCard(
      id: 'authorized-$username',
      username: username,
      displayName: 'Ada',
      relationship: 'none',
    ),
  );

  @override
  Future<ApiResult<void>> send(String userId) async {
    sent.add(userId);
    return const ApiSuccess(null);
  }
}

ProfileDetails publicProfile(String username) => ProfileDetails(
  id: null,
  username: username,
  displayName: 'Ada Public',
  detailsVisible: true,
  projection: ProfileProjection.public,
  bio: 'A public journal.',
  isOwner: false,
  streak: const PostingStreak(current: 4, longest: 8, postedToday: true),
);

ProfileDetails restrictedProfile(String username) => ProfileDetails(
  id: null,
  username: username,
  displayName: null,
  detailsVisible: false,
  projection: ProfileProjection.restricted,
  bio: null,
  isOwner: false,
);

void main() {
  testWidgets('keeps an anonymous public profile deep link during restore', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final profiles = FakeProfileClient({'ada': publicProfile('ada')});
    final posts = FakePostClient(null, [
      ApiSuccess(
        ProfilePostsPage(
          items: [profilePost('released', answer: 'Visible to everyone.')],
          nextCursor: null,
          hasMore: false,
        ),
      ),
    ]);
    final harness = TestHarness(profiles: profiles, posts: posts);

    await tester.pumpWidget(
      DayliApp(
        services: harness.services,
        useGoogleFonts: false,
        initialLocation: '/u/ada',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('profile.username')), findsOneWidget);
    expect(find.text('Ada Public'), findsOneWidget);
    expect(find.text('A public journal.'), findsOneWidget);
    expect(find.text('Visible to everyone.'), findsOneWidget);
    expect(profiles.requested, ['ada', 'ada']);
  });

  testWidgets('renders a private anonymous profile with username only', (
    tester,
  ) async {
    final harness = TestHarness(
      profiles: FakeProfileClient({
        'private_one': restrictedProfile('private_one'),
      }),
    );
    await tester.pumpWidget(
      DayliApp(
        services: harness.services,
        useGoogleFonts: false,
        initialLocation: '/u/private_one',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('@private_one'), findsOneWidget);
    expect(find.text('This profile is private.'), findsOneWidget);
    expect(find.byKey(const Key('profile.avatar')), findsNothing);
    expect(harness.posts.profileRequests, isEmpty);
  });

  testWidgets('opens a released public post without a session', (tester) async {
    final posts = FakePostClient([
      ApiSuccess(postDetail('public-post', answer: 'Anonymous detail.')),
    ]);
    final harness = TestHarness(posts: posts);
    await tester.pumpWidget(
      DayliApp(
        services: harness.services,
        useGoogleFonts: false,
        initialLocation: '/posts/public-post',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Anonymous detail.'), findsOneWidget);
    expect(posts.requested, ['public-post', 'public-post']);
  });

  testWidgets('expired bearer restoration retries a post anonymously', (
    tester,
  ) async {
    final posts = ControlledPostClient();
    final harness = TestHarness(posts: posts);
    harness.tokens.value = 'expired-token';

    await tester.pumpWidget(
      DayliApp(
        services: harness.services,
        useGoogleFonts: false,
        initialLocation: '/posts/public-post',
      ),
    );
    await tester.pump();
    expect(posts.pending, hasLength(2));
    expect(harness.session.status, SessionStatus.signedOut);

    posts.pending[1].complete(
      ApiSuccess(postDetail('public-post', answer: 'Anonymous retry.')),
    );
    await tester.pumpAndSettle();
    posts.pending[0].complete(const ApiError(Unauthenticated()));
    await tester.pumpAndSettle();

    expect(find.text('Anonymous retry.'), findsOneWidget);
    expect(harness.session.status, SessionStatus.signedOut);
  });

  testWidgets('expired bearer restoration retries a profile anonymously', (
    tester,
  ) async {
    final profiles = ControlledProfileClient();
    final harness = TestHarness(profiles: profiles);
    harness.tokens.value = 'expired-token';

    await tester.pumpWidget(
      DayliApp(
        services: harness.services,
        useGoogleFonts: false,
        initialLocation: '/u/ada',
      ),
    );
    await tester.pump();
    expect(profiles.pending, hasLength(2));
    expect(harness.session.status, SessionStatus.signedOut);

    profiles.pending[1].complete(ApiSuccess(publicProfile('ada')));
    await tester.pumpAndSettle();
    profiles.pending[0].complete(const ApiError(Unauthenticated()));
    await tester.pumpAndSettle();

    expect(find.text('Ada Public'), findsOneWidget);
    expect(harness.session.status, SessionStatus.signedOut);
  });

  testWidgets('discards an old account post success after account switch', (
    tester,
  ) async {
    final posts = ControlledPostClient();
    final harness = TestHarness(posts: posts);
    await harness.session.signIn(
      email: 'jos@example.test',
      password: 'correct-password',
    );

    await tester.pumpWidget(
      DayliApp(
        services: harness.services,
        useGoogleFonts: false,
        initialLocation: '/posts/protected',
      ),
    );
    await tester.pump();
    expect(posts.pending, hasLength(1));

    harness.testUserId = 'user-2';
    await harness.session.signIn(
      email: 'jos@example.test',
      password: 'correct-password',
    );
    await tester.pump();
    expect(posts.pending, hasLength(2));
    posts.pending[1].complete(
      ApiSuccess(postDetail('protected', answer: 'Account B post.')),
    );
    await tester.pumpAndSettle();
    posts.pending[0].complete(
      ApiSuccess(
        postDetail(
          'protected',
          answer: 'Account A private post.',
          audience: 'solo',
          viewerIsAuthor: true,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Account B post.'), findsOneWidget);
    expect(find.text('Account A private post.'), findsNothing);
    expect(harness.session.user?.id, 'user-2');
  });

  testWidgets('discards a protected post and stale 401 after logout', (
    tester,
  ) async {
    final posts = ControlledPostClient();
    final harness = TestHarness(posts: posts);
    await harness.session.signIn(
      email: 'jos@example.test',
      password: 'correct-password',
    );

    await tester.pumpWidget(
      DayliApp(
        services: harness.services,
        useGoogleFonts: false,
        initialLocation: '/posts/protected',
      ),
    );
    await tester.pump();
    await harness.session.signOut();
    await tester.pump();
    expect(posts.pending, hasLength(2));

    posts.pending[1].complete(
      ApiSuccess(postDetail('protected', answer: 'Anonymous public post.')),
    );
    await tester.pumpAndSettle();
    posts.pending[0].complete(const ApiError(Unauthenticated()));
    await tester.pumpAndSettle();

    expect(find.text('Anonymous public post.'), findsOneWidget);
    expect(harness.session.status, SessionStatus.signedOut);
  });

  testWidgets('returns a finite friend intent without replaying the mutation', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final friends = IntentFriendsClient();
    final harness = TestHarness(
      profiles: FakeProfileClient({'ada': publicProfile('ada')}),
      friends: friends,
    );
    await tester.pumpWidget(
      DayliApp(
        services: harness.services,
        useGoogleFonts: false,
        initialLocation: '/u/ada',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('@ada'), findsWidgets);
    await tester.ensureVisible(find.byKey(const Key('profile.friend')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('profile.friend')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('auth.email')), findsOneWidget);
    await tester.enterText(
      find.byKey(const Key('auth.email')),
      'jos@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('auth.password')),
      'correct-password',
    );
    await tester.tap(find.byKey(const Key('auth.submit')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('profile.intent')), findsOneWidget);
    expect(friends.sent, isEmpty);
    await tester.tap(find.byKey(const Key('profile.friend')));
    await tester.pumpAndSettle();
    expect(friends.sent, ['authorized-ada']);
  });

  testWidgets(
    'live Google provider keeps message intent through username setup',
    (tester) async {
      tester.view.physicalSize = const Size(800, 1800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final provider = LiveGoogleProvider();
      final harness = TestHarness(
        profiles: FakeProfileClient({'ada': publicProfile('ada')}),
        friends: IntentFriendsClient(),
        google: provider,
      );
      await tester.pumpWidget(
        DayliApp(
          services: harness.services,
          useGoogleFonts: false,
          initialLocation: '/u/ada',
        ),
      );
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.byKey(const Key('profile.message')));
      await tester.tap(find.byKey(const Key('profile.message')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('auth.google')));
      await tester.pumpAndSettle();

      expect(provider.calls, 1);
      expect(harness.session.status, SessionStatus.needsUsernameSetup);
      expect(find.byKey(const Key('setup.username')), findsOneWidget);
      expect(find.text('Provider Name'), findsNothing);

      await tester.enterText(
        find.byKey(const Key('setup.username')),
        'google_user',
      );
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('profile.intent')), findsOneWidget);
      expect(
        find.text('Review and start the message request below.'),
        findsOneWidget,
      );
      expect(harness.session.status, SessionStatus.signedIn);
    },
  );

  test('rejects external, malformed, and unknown return state', () {
    expect(
      PublicReturnIntent.fromAuthUri(
        Uri.parse('/sign-in?returnTo=https%3A%2F%2Fevil.test&action=like'),
      ),
      isNull,
    );
    expect(
      PublicReturnIntent.fromAuthUri(
        Uri.parse('/sign-in?returnTo=%2Fsettings&action=like'),
      ),
      isNull,
    );
    expect(
      PublicReturnIntent.fromAuthUri(
        Uri.parse('/sign-in?returnTo=%2Fu%2Fada&action=delete'),
      ),
      isNull,
    );
    expect(
      PublicReturnIntent.fromAuthUri(
        Uri.parse('/sign-in?returnTo=%2Fu%2Fada&action=like'),
      ),
      isNull,
    );
  });
}

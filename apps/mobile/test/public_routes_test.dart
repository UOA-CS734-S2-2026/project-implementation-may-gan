import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/api/profile_client.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/auth/public_return_intent.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

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
    expect(profiles.requested, ['ada']);
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
    expect(posts.requested, ['public-post']);
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

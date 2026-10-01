import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/feed_client.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/home/home_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'home_feed_test.dart' show signIn;
import 'support/fakes.dart';

/// Resolves profiles by handle, with a relationship the test can change.
class ProfileFriendsClient extends FakeFriendsClient {
  ProfileFriendsClient(this.people);

  final Map<String, FriendCard> people;
  final removed = <String>[];

  @override
  Future<ApiResult<FriendCard>> profile(String username) async {
    final person = people[username];
    return person == null ? const ApiError(NotFound()) : ApiSuccess(person);
  }

  @override
  Future<ApiResult<void>> remove(String userId) async {
    removed.add(userId);
    people.updateAll(
      (_, person) => person.id == userId
          ? FriendCard(
              id: person.id,
              username: person.username,
              displayName: person.displayName,
              relationship: 'none',
            )
          : person,
    );
    return const ApiSuccess(null);
  }
}

const me = FriendCard(
  id: 'user-1',
  username: 'jos',
  displayName: 'Jos',
  relationship: 'none',
);
const ada = FriendCard(
  id: 'user-ada',
  username: 'ada',
  displayName: 'Ada',
  relationship: 'friends',
);
const bea = FriendCard(
  id: 'user-bea',
  username: 'bea',
  displayName: 'Bea',
  relationship: 'none',
);

Future<void> openProfile(
  WidgetTester tester,
  TestHarness harness,
  String username,
) async {
  await signIn(tester, harness);
  GoRouter.of(tester.element(find.byType(HomeScreen))).go('/u/$username');
  await tester.pumpAndSettle();
}

ProfilePostsPage page(List<ProfilePost> items, {String? next}) =>
    ProfilePostsPage(items: items, nextCursor: next, hasMore: next != null);

/// Profile screens are long; a phone-height view keeps them built in tests.
void testProfile(String name, Future<void> Function(WidgetTester) body) =>
    testWidgets(name, (tester) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await body(tester);
    });

void main() {
  testProfile('shows a friend\'s daylies and loads the next page', (
    tester,
  ) async {
    final posts = FakePostClient(null, [
      ApiSuccess(
        page([profilePost('1', answer: 'Walked the coast.')], next: 'c1'),
      ),
      ApiSuccess(page([profilePost('2', answer: 'Baked bread.')])),
    ]);
    final harness = TestHarness(
      friends: ProfileFriendsClient({'ada': ada}),
      posts: posts,
    );
    await openProfile(tester, harness, 'ada');

    await tester.ensureVisible(find.text('Walked the coast.'));
    expect(find.text('Walked the coast.'), findsOneWidget);
    expect(find.byKey(const Key('profile.posts.label.1')), findsNothing);

    await tester.ensureVisible(find.byKey(const Key('profile.posts.more')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('profile.posts.more')));
    await tester.pumpAndSettle();

    expect(find.text('Baked bread.'), findsOneWidget);
    expect(posts.profileRequests, [('ada', null), ('ada', 'c1')]);
    expect(find.byKey(const Key('profile.posts.more')), findsNothing);
  });

  testProfile('opens a post from its card', (tester) async {
    final harness = TestHarness(
      friends: ProfileFriendsClient({'ada': ada}),
      posts: FakePostClient(
        [ApiSuccess(postDetail('1', answer: 'The whole answer.'))],
        [
          ApiSuccess(page([profilePost('1')])),
        ],
      ),
    );
    await openProfile(tester, harness, 'ada');

    await tester.ensureVisible(find.byKey(const Key('profile.posts.post.1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('profile.posts.post.1')));
    await tester.pumpAndSettle();

    expect(harness.posts.requested, ['1']);
    expect(find.text('The whole answer.'), findsOneWidget);
  });

  testProfile('asks a non-friend to add them and never loads posts', (
    tester,
  ) async {
    final harness = TestHarness(friends: ProfileFriendsClient({'bea': bea}));
    await openProfile(tester, harness, 'bea');

    expect(
      find.text('Add Bea as a friend to see their daylies.'),
      findsOneWidget,
    );
    expect(harness.posts.profileRequests, isEmpty);
  });

  testProfile('hides the daylies after removing the friend', (tester) async {
    final friends = ProfileFriendsClient({'ada': ada});
    final harness = TestHarness(
      friends: friends,
      posts: FakePostClient(null, [
        ApiSuccess(page([profilePost('1')])),
      ]),
    );
    await openProfile(tester, harness, 'ada');
    expect(find.byKey(const Key('profile.posts.post.1')), findsOneWidget);

    await tester.tap(find.byKey(const Key('profile.friend')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('profile.removeFriend.confirm')));
    await tester.pumpAndSettle();

    expect(friends.removed, ['user-ada']);
    expect(find.byKey(const Key('profile.posts.post.1')), findsNothing);
    expect(find.byKey(const Key('profile.posts.friendsOnly')), findsOneWidget);
  });

  testProfile('my days lists your own daylies with who can see them', (
    tester,
  ) async {
    final posts = FakePostClient(null, [
      ApiSuccess(
        page([
          profilePost('today', username: 'jos', released: false),
          profilePost('solo', username: 'jos', audience: 'solo'),
          profilePost('shared', username: 'jos'),
        ]),
      ),
    ]);
    final harness = TestHarness(
      friends: ProfileFriendsClient({'jos': me}),
      posts: posts,
    );
    await signIn(tester, harness);
    await tester.tap(find.byKey(const Key('shell.nav.my days')));
    await tester.pumpAndSettle();

    expect(posts.profileRequests, [('jos', null)]);
    expect(
      tester
          .widget<Text>(find.byKey(const Key('profile.posts.label.today')))
          .data,
      'Not released yet',
    );
    await tester.ensureVisible(
      find.byKey(const Key('profile.posts.label.solo')),
    );
    expect(
      tester
          .widget<Text>(find.byKey(const Key('profile.posts.label.solo')))
          .data,
      'Only you',
    );
    expect(find.byKey(const Key('profile.posts.label.shared')), findsNothing);
    expect(find.text('add friend'), findsNothing);
  });

  testProfile('shows an empty message and a retry after a failure', (
    tester,
  ) async {
    final harness = TestHarness(
      friends: ProfileFriendsClient({'ada': ada}),
      posts: FakePostClient(null, [
        const ApiError(NetworkUnavailable()),
        ApiSuccess(page([])),
      ]),
    );
    await openProfile(tester, harness, 'ada');

    expect(find.byKey(const Key('profile.posts.error')), findsOneWidget);
    await tester.tap(find.byKey(const Key('profile.posts.retry')));
    await tester.pumpAndSettle();

    expect(
      find.text("Ada hasn't shared any daylies with you yet."),
      findsOneWidget,
    );
  });

  testProfile('opens a friend\'s profile from their name on a feed card', (
    tester,
  ) async {
    final harness = TestHarness(
      feed: FakeFeedClient([
        ApiSuccess(
          FeedPage(items: [feedPost('1')], nextCursor: null, hasMore: false),
        ),
      ]),
      friends: ProfileFriendsClient({
        'friend_1': const FriendCard(
          id: 'author-1',
          username: 'friend_1',
          displayName: 'Friend 1',
          relationship: 'friends',
        ),
      }),
    );
    await signIn(tester, harness);
    await tester.ensureVisible(find.byKey(const Key('home.feed.author.1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('home.feed.author.1')));
    await tester.pumpAndSettle();

    expect(find.text('@friend_1'), findsOneWidget);
    expect(harness.posts.requested, isEmpty);
    expect(harness.posts.profileRequests.single.$1, 'friend_1');
  });

  testProfile('opens the author\'s profile from a post', (tester) async {
    final harness = TestHarness(
      feed: FakeFeedClient([
        ApiSuccess(
          FeedPage(items: [feedPost('1')], nextCursor: null, hasMore: false),
        ),
      ]),
      friends: ProfileFriendsClient({
        'friend_1': const FriendCard(
          id: 'author-1',
          username: 'friend_1',
          displayName: 'Friend 1',
          relationship: 'friends',
        ),
      }),
      posts: FakePostClient([ApiSuccess(postDetail('1'))]),
    );
    await signIn(tester, harness);
    await tester.ensureVisible(find.byKey(const Key('home.feed.post.1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('home.feed.post.1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('post.author')));
    await tester.pumpAndSettle();

    expect(harness.posts.profileRequests.single.$1, 'friend_1');
  });
}

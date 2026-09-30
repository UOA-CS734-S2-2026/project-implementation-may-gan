import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/api/profile_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'home_feed_test.dart' show signIn;
import 'profile_posts_test.dart'
    show ProfileFriendsClient, ada, bea, me, openProfile;
import 'support/fakes.dart';

ProfileDetails details(
  String username, {
  String? displayName,
  String? bio,
  bool visible = true,
  bool owner = false,
  bool isPrivate = false,
  DateTime? waitUntil,
  PostingStreak? streak,
}) => ProfileDetails(
  id: 'user-$username',
  username: username,
  displayName: displayName ?? username,
  detailsVisible: visible,
  bio: visible ? bio : null,
  isOwner: owner,
  streak: visible ? streak : null,
  isPrivate: isPrivate,
  usernameChangeAvailableAt: waitUntil,
);

Future<void> openEditProfile(WidgetTester tester, TestHarness harness) async {
  await signIn(tester, harness);
  await tester.tap(find.byKey(const Key('shell.nav.my days')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('profile.edit')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('shows a friend\'s bio', (tester) async {
    final harness = TestHarness(
      friends: ProfileFriendsClient({'ada': ada}),
      profiles: FakeProfileClient({
        'ada': details('ada', displayName: 'Ada', bio: 'Counts things.'),
      }),
    );
    await openProfile(tester, harness, 'ada');

    expect(find.text('Counts things.'), findsOneWidget);
    expect(find.byKey(const Key('profile.edit')), findsNothing);
  });

  testWidgets('says a private profile is private', (tester) async {
    final harness = TestHarness(
      friends: ProfileFriendsClient({'bea': bea}),
      profiles: FakeProfileClient({
        'bea': details('bea', displayName: 'Bea', visible: false),
      }),
    );
    await openProfile(tester, harness, 'bea');

    expect(find.text("Bea's profile is private."), findsOneWidget);
    expect(find.byKey(const Key('profile.bio')), findsNothing);
  });

  testWidgets('follows an old handle to the current one', (tester) async {
    final friends = ProfileFriendsClient({
      'ada_new': const FriendCard(
        id: 'user-ada',
        username: 'ada_new',
        displayName: 'Ada',
        relationship: 'friends',
      ),
    });
    final profiles = FakeProfileClient({
      'ada': details('ada_new', displayName: 'Ada'),
      'ada_new': details('ada_new', displayName: 'Ada'),
    });
    final harness = TestHarness(friends: friends, profiles: profiles);
    await openProfile(tester, harness, 'ada');

    expect(profiles.requested, containsAllInOrder(['ada', 'ada_new']));
    expect(find.text('@ada_new'), findsOneWidget);
  });

  testWidgets('saves the public name and bio from my days', (tester) async {
    final profiles = FakeProfileClient({
      'jos': details('jos', displayName: 'Jos', bio: 'Walks.', owner: true),
    });
    final harness = TestHarness(
      friends: ProfileFriendsClient({'jos': me}),
      profiles: profiles,
    );
    await openEditProfile(tester, harness);

    await tester.enterText(find.byKey(const Key('editProfile.name')), '');
    await tester.enterText(
      find.byKey(const Key('editProfile.bio')),
      '  Walks and bakes.  ',
    );
    await tester.tap(find.byKey(const Key('editProfile.save')));
    await tester.pumpAndSettle();

    expect(profiles.updates.single, (
      bio: 'Walks and bakes.',
      publicName: '',
      isPrivate: null,
    ));
    expect(find.text('Saved.'), findsOneWidget);

    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Walks and bakes.'), findsOneWidget);
  });

  testWidgets('changes the username and follows it in my days', (tester) async {
    final profiles = FakeProfileClient({
      'jos': details('jos', owner: true),
      'jos_walks': details('jos_walks', owner: true),
    });
    final harness = TestHarness(
      friends: ProfileFriendsClient({
        'jos': me,
        'jos_walks': const FriendCard(
          id: 'user-1',
          username: 'jos_walks',
          displayName: 'Jos',
          relationship: 'none',
        ),
      }),
      profiles: profiles,
    );
    await openEditProfile(tester, harness);

    await tester.enterText(
      find.byKey(const Key('editProfile.username')),
      'Jos_Walks',
    );
    await tester.pump();
    await tester.ensureVisible(
      find.byKey(const Key('editProfile.changeUsername')),
    );
    await tester.tap(find.byKey(const Key('editProfile.changeUsername')));
    await tester.pumpAndSettle();

    expect(profiles.usernameChanges, ['jos_walks']);
    expect(harness.session.user?.username, 'jos_walks');
    expect(find.text('Username changed.'), findsOneWidget);
  });

  testWidgets('shows why a username change was refused', (tester) async {
    final profiles = FakeProfileClient({'jos': details('jos', owner: true)})
      ..changeResult = const ApiError(
        Conflict('That username is already taken.'),
      );
    final harness = TestHarness(
      friends: ProfileFriendsClient({'jos': me}),
      profiles: profiles,
    );
    await openEditProfile(tester, harness);

    await tester.enterText(
      find.byKey(const Key('editProfile.username')),
      'ben',
    );
    await tester.pump();
    await tester.ensureVisible(
      find.byKey(const Key('editProfile.changeUsername')),
    );
    await tester.tap(find.byKey(const Key('editProfile.changeUsername')));
    await tester.pumpAndSettle();

    expect(find.text('That username is already taken.'), findsOneWidget);
    expect(harness.session.user?.username, 'jos');
  });

  testWidgets('locks the username until the next change is allowed', (
    tester,
  ) async {
    final harness = TestHarness(
      friends: ProfileFriendsClient({'jos': me}),
      profiles: FakeProfileClient({
        'jos': details(
          'jos',
          owner: true,
          waitUntil: DateTime.utc(2026, 10, 30, 3),
        ),
      }),
    );
    await openEditProfile(tester, harness);

    expect(
      find.textContaining('You can change your username again on'),
      findsOneWidget,
    );
    final button = tester.widget<Semantics>(
      find
          .descendant(
            of: find.byKey(const Key('editProfile.changeUsername')),
            matching: find.byType(Semantics),
          )
          .first,
    );
    expect(button.properties.enabled, isNot(true));
  });

  testWidgets('saves the privacy switch on its own', (tester) async {
    final profiles = FakeProfileClient({'jos': details('jos', owner: true)});
    final harness = TestHarness(
      friends: ProfileFriendsClient({'jos': me}),
      profiles: profiles,
    );
    await openEditProfile(tester, harness);

    await tester.ensureVisible(find.byKey(const Key('editProfile.private')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('editProfile.private')));
    await tester.pumpAndSettle();

    expect(profiles.updates.single, (
      bio: null,
      publicName: null,
      isPrivate: true,
    ));
    expect(
      find.text('Only your friends can see your bio and streak.'),
      findsOneWidget,
    );
  });

  testWidgets('pull to refresh reloads the profile and its daylies', (
    tester,
  ) async {
    final profiles = FakeProfileClient({
      'ada': details('ada', displayName: 'Ada'),
    });
    final harness = TestHarness(
      friends: ProfileFriendsClient({'ada': ada}),
      profiles: profiles,
    );
    await openProfile(tester, harness, 'ada');
    final reads = profiles.requested.length;
    final pages = harness.posts.profileRequests.length;

    await tester.fling(find.text('@ada'), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();

    expect(profiles.requested.length, reads + 1);
    expect(harness.posts.profileRequests.length, pages + 1);
  });

  testWidgets('shows a friend\'s streak without the owner-only note', (
    tester,
  ) async {
    final harness = TestHarness(
      friends: ProfileFriendsClient({'ada': ada}),
      profiles: FakeProfileClient({
        'ada': details(
          'ada',
          streak: const PostingStreak(
            current: 3,
            longest: 5,
            postedToday: true,
          ),
        ),
      }),
    );
    await openProfile(tester, harness, 'ada');

    expect(find.text('3 days in a row · Longest: 5 days'), findsOneWidget);
  });

  testWidgets('tells the owner today\'s dayli is in, or how to start', (
    tester,
  ) async {
    final profiles = FakeProfileClient({
      'jos': details(
        'jos',
        owner: true,
        streak: const PostingStreak(current: 1, longest: 1, postedToday: true),
      ),
    });
    final harness = TestHarness(
      friends: ProfileFriendsClient({'jos': me}),
      profiles: profiles,
    );
    await signIn(tester, harness);
    await tester.tap(find.byKey(const Key('shell.nav.my days')));
    await tester.pumpAndSettle();

    expect(
      find.text("1 day in a row · Longest: 1 day · Today's dayli is in."),
      findsOneWidget,
    );
  });

  testWidgets('hides the streak on a private profile', (tester) async {
    final harness = TestHarness(
      friends: ProfileFriendsClient({'bea': bea}),
      profiles: FakeProfileClient({
        'bea': details(
          'bea',
          visible: false,
          streak: const PostingStreak(
            current: 3,
            longest: 3,
            postedToday: true,
          ),
        ),
      }),
    );
    await openProfile(tester, harness, 'bea');

    expect(find.byKey(const Key('profile.streak')), findsNothing);
  });
}

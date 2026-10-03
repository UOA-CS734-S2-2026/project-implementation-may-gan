import 'package:dayli_mobile/api/api_failure.dart';
import 'dart:async';

import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/api/profile_client.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/posts/post_activity.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
import 'package:dayli_mobile/profile/streak_cache.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'home_feed_test.dart' show signIn;
import 'profile_details_test.dart' show details;
import 'profile_posts_test.dart'
    show ProfileFriendsClient, ada, me, openProfile, testProfile;
import 'support/fakes.dart';

const _stats = ProfileStats(posts: 3, friends: 1);

ProfileDetails mine(PostingStreak streak) => details(
  'jos',
  displayName: 'Jos',
  owner: true,
  streak: streak,
  stats: _stats,
);

Future<void> openMyDays(WidgetTester tester, TestHarness harness) async {
  await signIn(tester, harness);
  await tester.tap(find.byKey(const Key('shell.nav.my days')));
  await tester.pumpAndSettle();
}

TestHarness harnessFor(FakeProfileClient profiles) => TestHarness(
  friends: ProfileFriendsClient({'jos': me, 'ada': ada}),
  profiles: profiles,
);

void main() {
  testProfile('gives a new user a clear empty state', (tester) async {
    final semantics = tester.ensureSemantics();
    final harness = harnessFor(
      FakeProfileClient({
        'jos': mine(
          const PostingStreak(current: 0, longest: 0, postedToday: false),
        ),
      }),
    );
    await openMyDays(tester, harness);

    expect(find.text('No streak yet'), findsOneWidget);
    expect(
      find.bySemanticsLabel(
        "0 Day streak, no streak yet, today's post isn't in yet",
      ),
      findsOneWidget,
    );
    semantics.dispose();
  });

  testProfile('marks today on a one-day streak', (tester) async {
    final semantics = tester.ensureSemantics();
    final harness = harnessFor(
      FakeProfileClient({
        'jos': mine(
          const PostingStreak(current: 1, longest: 1, postedToday: true),
        ),
      }),
    );
    await openMyDays(tester, harness);

    expect(find.byKey(const Key('profile.stats.today')), findsOneWidget);
    expect(find.text("Today's in"), findsOneWidget);
    expect(
      find.bySemanticsLabel("1 Day streak, today's post is in"),
      findsOneWidget,
    );
    semantics.dispose();
  });

  testProfile('shows a missed day plainly', (tester) async {
    final semantics = tester.ensureSemantics();
    final harness = harnessFor(
      FakeProfileClient({
        'jos': mine(
          const PostingStreak(current: 0, longest: 4, postedToday: false),
        ),
      }),
    );
    await openMyDays(tester, harness);

    expect(find.text('No streak yet'), findsNothing);
    expect(find.byKey(const Key('profile.stats.today')), findsNothing);
    expect(
      find.bySemanticsLabel("0 Day streak, today's post isn't in yet"),
      findsOneWidget,
    );
    semantics.dispose();
  });

  testProfile('keeps today\'s mark and the cache to the owner', (tester) async {
    final semantics = tester.ensureSemantics();
    final harness = harnessFor(
      FakeProfileClient({
        'ada': details(
          'ada',
          streak: const PostingStreak(
            current: 3,
            longest: 5,
            postedToday: true,
          ),
          stats: _stats,
        ),
      }),
    );
    await openProfile(tester, harness, 'ada');

    expect(find.bySemanticsLabel('3 Day streak'), findsOneWidget);
    expect(find.byKey(const Key('profile.stats.today')), findsNothing);
    expect(await harness.streakCache.read('user-1'), isNull);
    semantics.dispose();
  });

  testProfile('reloads after your post is accepted or deleted', (tester) async {
    final semantics = tester.ensureSemantics();
    final profiles = FakeProfileClient({
      'jos': mine(
        const PostingStreak(current: 1, longest: 1, postedToday: false),
      ),
    });
    final harness = harnessFor(profiles);
    await openMyDays(tester, harness);
    expect(
      find.bySemanticsLabel("1 Day streak, today's post isn't in yet"),
      findsOneWidget,
    );

    profiles.profiles['jos'] = mine(
      const PostingStreak(current: 2, longest: 2, postedToday: true),
    );
    harness.postActivity.changed();
    await tester.pumpAndSettle();
    expect(
      find.bySemanticsLabel("2 Day streak, today's post is in"),
      findsOneWidget,
    );

    // Deleting today's post takes the streak back.
    profiles.profiles['jos'] = mine(
      const PostingStreak(current: 1, longest: 2, postedToday: false),
    );
    harness.postActivity.changed();
    await tester.pumpAndSettle();
    expect(
      find.bySemanticsLabel("1 Day streak, today's post isn't in yet"),
      findsOneWidget,
    );
    expect((await harness.streakCache.read('user-1'))?.streak.current, 1);
    semantics.dispose();
  });

  testProfile('leaves a friend\'s profile alone when your posts change', (
    tester,
  ) async {
    final profiles = FakeProfileClient();
    final harness = harnessFor(profiles);
    await openProfile(tester, harness, 'ada');
    final reads = profiles.requested.length;

    harness.postActivity.changed();
    await tester.pumpAndSettle();
    expect(profiles.requested.length, reads);
  });

  testProfile('reloads when the app comes back', (tester) async {
    final profiles = FakeProfileClient({
      'jos': mine(
        const PostingStreak(current: 1, longest: 1, postedToday: true),
      ),
    });
    final harness = harnessFor(profiles);
    await openMyDays(tester, harness);
    final reads = profiles.requested.length;

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(profiles.requested.length, reads + 1);
  });

  testProfile('keeps the confirmed streak, marked stale, when offline', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final profiles = FakeProfileClient({
      'jos': mine(
        const PostingStreak(current: 5, longest: 5, postedToday: true),
      ),
    });
    final harness = harnessFor(profiles);
    await openMyDays(tester, harness);
    expect(find.byKey(const Key('profile.stats.stale')), findsNothing);

    profiles.detailsFailure = const NetworkUnavailable();
    harness.postActivity.changed();
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('profile.stats.stale')), findsOneWidget);
    expect(find.textContaining('may be out of date'), findsOneWidget);
    // The day may have moved on, so today's mark is left out.
    expect(find.byKey(const Key('profile.stats.today')), findsNothing);
    expect(
      find.bySemanticsLabel(
        RegExp(r'^5 Day streak, Last confirmed .+, may be out of date$'),
      ),
      findsOneWidget,
    );

    profiles.detailsFailure = null;
    harness.postActivity.changed();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('profile.stats.stale')), findsNothing);
    expect(find.byKey(const Key('profile.stats.today')), findsOneWidget);
    semantics.dispose();
  });

  testProfile('shows the cached streak when your profile can\'t load', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final profiles = FakeProfileClient({
      'jos': mine(
        const PostingStreak(current: 4, longest: 6, postedToday: true),
      ),
    })..detailsFailure = const NetworkUnavailable();
    final harness = harnessFor(profiles);
    await harness.streakCache.write(
      'user-1',
      CachedStreak(
        const PostingStreak(current: 4, longest: 6, postedToday: true),
        DateTime.utc(2026, 9, 24, 20, 5),
      ),
      epoch: harness.streakCache.epoch,
    );
    await openMyDays(tester, harness);

    expect(find.byKey(const Key('profile.offline')), findsOneWidget);
    expect(find.textContaining('may be out of date'), findsOneWidget);
    expect(find.byKey(const Key('profile.stats.today')), findsNothing);
    expect(
      find.bySemanticsLabel(
        RegExp(r'^4 Day streak, Last confirmed .+, may be out of date$'),
      ),
      findsOneWidget,
    );

    profiles.detailsFailure = null;
    await tester.fling(
      find.byKey(const Key('profile.offline')),
      const Offset(0, 1200),
      1000,
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('profile.offline')), findsNothing);
    expect(find.byKey(const Key('profile.stats.today')), findsOneWidget);
    semantics.dispose();
  });

  testProfile('says the profile is unavailable offline with nothing cached', (
    tester,
  ) async {
    final harness = harnessFor(
      FakeProfileClient()..detailsFailure = const NetworkUnavailable(),
    );
    await openMyDays(tester, harness);

    expect(find.byKey(const Key('profile.offline')), findsNothing);
    expect(find.text('This profile is unavailable.'), findsOneWidget);
  });

  test('the cache holds one account and never hands it to another', () async {
    final cache = MemoryStreakCache();
    final value = CachedStreak(
      const PostingStreak(current: 2, longest: 3, postedToday: false),
      DateTime.utc(2026, 9, 25),
    );
    await cache.write('user-1', value, epoch: cache.epoch);
    expect(await cache.read('user-2'), isNull);
    expect((await cache.read('user-1'))?.streak.current, 2);
    await cache.clear();
    expect(await cache.read('user-1'), isNull);
  });

  testProfile('never falls back to a stale profile that isn\'t yours', (
    tester,
  ) async {
    final profiles = FakeProfileClient({
      'ada': details(
        'ada',
        displayName: 'Ada',
        streak: const PostingStreak(current: 3, longest: 5, postedToday: true),
        stats: _stats,
      ),
    });
    final harness = TestHarness(
      friends: ProfileFriendsClient({'ada': friendAda}),
      profiles: profiles,
    );
    await openProfile(tester, harness, 'ada');
    expect(find.text('Ada'), findsWidgets);

    // Access may have changed, as after removing the friend, so a failed
    // reload must not keep their profile or posts on screen.
    profiles.detailsFailure = const NetworkUnavailable();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.text('This profile is unavailable.'), findsOneWidget);
    expect(find.byKey(const Key('profile.stats.stale')), findsNothing);
  });

  testProfile('lets only the newest load set the streak', (tester) async {
    final semantics = tester.ensureSemantics();
    final profiles = _GatedProfiles({
      'jos': mine(
        const PostingStreak(current: 1, longest: 1, postedToday: false),
      ),
    });
    final harness = harnessFor(profiles);
    await openMyDays(tester, harness);

    // An older reload is still waiting when a newer one starts and answers.
    final slow = profiles.hold();
    harness.postActivity.changed();
    await tester.pump();
    profiles.profiles['jos'] = mine(
      const PostingStreak(current: 2, longest: 2, postedToday: true),
    );
    harness.postActivity.changed();
    await tester.pumpAndSettle();

    // The older answer, from before the post, arrives last.
    slow.complete(
      ApiSuccess(
        mine(const PostingStreak(current: 1, longest: 1, postedToday: false)),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.bySemanticsLabel("2 Day streak, today's post is in"),
      findsOneWidget,
    );
    expect((await harness.streakCache.read('user-1'))?.streak.current, 2);
    semantics.dispose();
  });

  testProfile('drops a load that answers after sign-out cleared the cache', (
    tester,
  ) async {
    final profiles = _GatedProfiles({
      'jos': mine(
        const PostingStreak(current: 1, longest: 1, postedToday: false),
      ),
    });
    final harness = harnessFor(profiles);
    await openMyDays(tester, harness);
    await harness.streakCache.clear();

    final slow = profiles.hold();
    harness.postActivity.changed();
    await tester.pump();
    await harness.streakCache.clear();
    slow.complete(
      ApiSuccess(
        mine(const PostingStreak(current: 7, longest: 7, postedToday: true)),
      ),
    );
    await tester.pumpAndSettle();

    expect(await harness.streakCache.read('user-1'), isNull);
  });

  test('the protected cache drops a write from before a clear', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final cache = ProtectedStreakCache(const FlutterSecureStorage());
    final value = CachedStreak(
      const PostingStreak(current: 2, longest: 3, postedToday: false),
      DateTime.utc(2026, 9, 25),
    );
    final before = cache.epoch;
    await cache.write('user-1', value, epoch: before);
    expect((await cache.read('user-1'))?.streak.current, 2);

    // A write started before a clear but queued behind it lands nowhere.
    unawaited(cache.clear());
    await cache.write('user-1', value, epoch: before);
    expect(await cache.read('user-1'), isNull);

    await cache.write('user-1', value, epoch: cache.epoch);
    expect((await cache.read('user-1'))?.streak.current, 2);
  });

  group('post activity from the request layer', () {
    test('reports an accepted post only', () async {
      final activity = PostActivity();
      var changes = 0;
      activity.addListener(() => changes++);
      final draft = DailyPostDraft(
        userId: 'user-1',
        localDate: '2026-09-25',
        promptId: 'prompt-1',
        promptText: 'What made today?',
        idempotencyKey: 'key-1',
        updatedAt: DateTime.utc(2026, 9, 25),
      );

      await ReportingPostSubmitter(
        FakeSubmitter(const SubmissionAccepted(postId: 'p', replayed: false)),
        activity,
      ).submit(draft);
      expect(changes, 1);

      await ReportingPostSubmitter(
        FakeSubmitter(
          const SubmissionRejected(SubmissionConflict.alreadyPosted),
        ),
        activity,
      ).submit(draft);
      await ReportingPostSubmitter(
        FakeSubmitter(const SubmissionFailed(NetworkUnavailable())),
        activity,
      ).submit(draft);
      expect(changes, 1);
    });

    test('reports a confirmed delete only', () async {
      final activity = PostActivity();
      var changes = 0;
      activity.addListener(() => changes++);
      final posts = FakePostClient();
      final client = ReportingPostClient(posts, activity);

      posts.deleteResult = const ApiSuccess(null);
      await client.delete('1');
      posts.deleteResult = const ApiError(NotFound());
      await client.delete('1');
      expect(changes, 2);

      posts.deleteResult = const ApiError(NetworkUnavailable());
      await client.delete('1');
      expect(changes, 2);
      expect(posts.deleted, ['1', '1', '1']);
    });
  });
}

const friendAda = FriendCard(
  id: 'user-ada',
  username: 'ada',
  displayName: 'Ada',
  relationship: 'friends',
);

/// Holds the next profile read until the test answers it.
class _GatedProfiles extends FakeProfileClient {
  _GatedProfiles(super.profiles);

  Completer<ApiResult<ProfileDetails>>? _held;

  Completer<ApiResult<ProfileDetails>> hold() => _held = Completer();

  @override
  Future<ApiResult<ProfileDetails>> details(String username) {
    if (_held case final held?) {
      _held = null;
      requested.add(username);
      return held.future;
    }
    return super.details(username);
  }
}

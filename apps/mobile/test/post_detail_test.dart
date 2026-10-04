import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/feed_client.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/api/post_page.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/ui/dayli_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';
import 'package:dayli_mobile/posts/private_media.dart';

import 'home_feed_test.dart' show signIn;
import 'support/fakes.dart';

TestHarness harnessWith(FakePostClient posts) => TestHarness(
  feed: FakeFeedClient([
    ApiSuccess(
      FeedPage(items: [feedPost('1')], nextCursor: null, hasMore: false),
    ),
  ]),
  posts: posts,
);

Future<void> openPost(WidgetTester tester, TestHarness harness) async {
  await signIn(tester, harness);
  await tester.ensureVisible(find.byKey(const Key('home.feed.post.1')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('home.feed.post.1')));
  await tester.pumpAndSettle();
}

Future<void> replaceActor(
  WidgetTester tester,
  TestHarness harness,
  String actorId,
) async {
  harness.testUserId = actorId;
  await harness.session.signIn(
    email: '$actorId@example.test',
    password: 'correct-password',
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('opens a friend\'s post from the feed', (tester) async {
    final semantics = tester.ensureSemantics();
    final harness = harnessWith(
      FakePostClient([
        ApiSuccess(
          postDetail(
            '1',
            answer: 'Walked the coastal track.',
            caption: 'Tide was in.',
          ),
        ),
      ]),
    );
    await openPost(tester, harness);

    expect(harness.posts.requested, ['1']);
    expect(find.text('Walked the coastal track.'), findsOneWidget);
    expect(find.text('Tide was in.'), findsOneWidget);
    expect(find.text('What made you smile today?'), findsOneWidget);
    expect(find.bySemanticsLabel('Rated 8 out of 10'), findsOneWidget);
    expect(find.text('Tuesday, 29 September 2026'), findsOneWidget);

    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('home.feed.post.1')), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('shows the author their audience and edited marker', (
    tester,
  ) async {
    final harness = harnessWith(
      FakePostClient([
        ApiSuccess(
          postDetail('1', audience: 'solo', viewerIsAuthor: true, edited: true),
        ),
      ]),
    );
    await openPost(tester, harness);

    expect(find.text('Tuesday, 29 September 2026 · Only you'), findsOneWidget);
    expect(find.byKey(const Key('post.history')), findsOneWidget);
    expect(find.text('Word dump'), findsNothing);
  });

  testWidgets('gives only the author the post menu', (tester) async {
    final harness = harnessWith(FakePostClient([ApiSuccess(postDetail('1'))]));
    await openPost(tester, harness);

    expect(find.byKey(const Key('post.menu')), findsNothing);
    expect(find.byKey(const Key('post.history')), findsNothing);
  });

  group('editing', () {
    Future<void> openEditor(WidgetTester tester, TestHarness harness) async {
      await openPost(tester, harness);
      await tester.tap(find.byKey(const Key('post.menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('post.edit')));
      await tester.pumpAndSettle();
    }

    testWidgets('saves every field and shows the saved post', (tester) async {
      final posts = FakePostClient([
        ApiSuccess(
          postDetail(
            '1',
            viewerIsAuthor: true,
            caption: 'Tide was in.',
            revisionCount: 2,
          ),
        ),
      ]);
      posts.updateResults
        ..clear()
        ..add(
          ApiSuccess(
            postDetail(
              '1',
              viewerIsAuthor: true,
              answer: 'Walked further.',
              edited: true,
              revisionCount: 3,
            ),
          ),
        );
      final harness = harnessWith(posts);
      await openEditor(tester, harness);

      expect(find.byKey(const Key('editPost.save')), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('editPost.answer')),
        'Walked further.',
      );
      await tester.enterText(find.byKey(const Key('editPost.caption')), '');
      await tester.tap(find.byKey(const Key('editPost.audience.solo')));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();

      final (postId, edit) = posts.edits.single;
      expect(postId, '1');
      expect(edit.expectedRevisionCount, 2);
      expect(edit.reflectiveAnswer, 'Walked further.');
      expect(edit.caption, isNull);
      expect(edit.rating, 8);
      expect(edit.audience, 'solo');
      expect(find.byKey(const Key('editPost.save')), findsNothing);
      expect(find.text('Walked further.'), findsOneWidget);
      expect(find.byKey(const Key('post.history')), findsOneWidget);
    });

    testWidgets('refreshes the feed after going back from an edit', (
      tester,
    ) async {
      final posts = FakePostClient([
        ApiSuccess(postDetail('1', viewerIsAuthor: true)),
      ]);
      posts.updateResults
        ..clear()
        ..add(
          ApiSuccess(postDetail('1', viewerIsAuthor: true, answer: 'New.')),
        );
      final harness = harnessWith(posts);
      await openEditor(tester, harness);
      await tester.enterText(find.byKey(const Key('editPost.answer')), 'New.');
      await tester.ensureVisible(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();
      expect(harness.feed.cursors, [null]);

      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();

      expect(harness.feed.cursors, [null, null]);
    });

    testWidgets('doesn\'t refresh the feed when nothing changed', (
      tester,
    ) async {
      final harness = harnessWith(
        FakePostClient([ApiSuccess(postDetail('1', viewerIsAuthor: true))]),
      );
      await openPost(tester, harness);
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();

      expect(harness.feed.cursors, [null]);
    });

    testWidgets('keeps the changes after a conflict and loads the latest', (
      tester,
    ) async {
      final posts = FakePostClient([
        ApiSuccess(postDetail('1', viewerIsAuthor: true)),
        ApiSuccess(
          postDetail(
            '1',
            viewerIsAuthor: true,
            answer: 'Edited on the web.',
            revisionCount: 1,
          ),
        ),
      ]);
      posts.updateResults
        ..clear()
        ..addAll([
          const ApiError(Conflict('edited elsewhere')),
          ApiSuccess(postDetail('1', viewerIsAuthor: true, answer: 'Mine.')),
        ]);
      final harness = harnessWith(posts);
      await openEditor(tester, harness);

      await tester.enterText(find.byKey(const Key('editPost.answer')), 'Mine.');
      await tester.ensureVisible(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('editPost.error')), findsOneWidget);
      expect(find.text('Mine.'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('editPost.reload')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.reload')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('editPost.notice')), findsOneWidget);
      expect(find.text('Mine.'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();

      expect(posts.edits.last.$2.expectedRevisionCount, 1);
      expect(find.text('Mine.'), findsOneWidget);
      expect(find.byKey(const Key('editPost.save')), findsNothing);
    });

    testWidgets('keeps the conflict when the latest version fails to load', (
      tester,
    ) async {
      final posts = FakePostClient([
        ApiSuccess(postDetail('1', viewerIsAuthor: true)),
        const ApiError(NetworkUnavailable()),
        ApiSuccess(postDetail('1', viewerIsAuthor: true, revisionCount: 1)),
      ]);
      posts.updateResults
        ..clear()
        ..add(const ApiError(Conflict('edited elsewhere')));
      final harness = harnessWith(posts);
      await openEditor(tester, harness);

      await tester.enterText(find.byKey(const Key('editPost.answer')), 'Mine.');
      await tester.ensureVisible(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('editPost.reload')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.reload')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('editPost.reloadError')), findsOneWidget);
      expect(find.byKey(const Key('editPost.reload')), findsOneWidget);
      expect(
        tester
            .widget<DayliButton>(find.byKey(const Key('editPost.save')))
            .onPressed,
        isNull,
      );

      await tester.tap(find.byKey(const Key('editPost.reload')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('editPost.reloadError')), findsNothing);
      expect(find.byKey(const Key('editPost.notice')), findsOneWidget);
      expect(find.text('Mine.'), findsOneWidget);
    });

    testWidgets('expires the current session when conflict reload gets a 401', (
      tester,
    ) async {
      final posts = FakePostClient([
        ApiSuccess(postDetail('1', viewerIsAuthor: true)),
        const ApiError(Unauthenticated()),
      ]);
      posts.updateResults
        ..clear()
        ..add(const ApiError(Conflict('edited elsewhere')));
      final harness = harnessWith(posts);
      await openEditor(tester, harness);

      await tester.enterText(
        find.byKey(const Key('editPost.answer')),
        'Account A unsaved private edit.',
      );
      await tester.ensureVisible(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('editPost.reload')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.reload')));
      await tester.pumpAndSettle();

      expect(harness.session.status, SessionStatus.signedOut);
      expect(find.byKey(const Key('editPost.save')), findsNothing);
      expect(find.text('Account A unsaved private edit.'), findsNothing);
    });

    testWidgets('keeps the changes when offline', (tester) async {
      final posts = FakePostClient([
        ApiSuccess(postDetail('1', viewerIsAuthor: true)),
      ]);
      posts.updateResults
        ..clear()
        ..add(const ApiError(NetworkUnavailable()));
      final harness = harnessWith(posts);
      await openEditor(tester, harness);

      await tester.enterText(find.byKey(const Key('editPost.answer')), 'Mine.');
      await tester.ensureVisible(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();

      expect(find.textContaining("You're offline"), findsOneWidget);
      expect(find.text('Mine.'), findsOneWidget);
    });

    testWidgets('discards a delayed account A save after switching to B', (
      tester,
    ) async {
      final posts = FakePostClient([
        ApiSuccess(
          postDetail('1', viewerIsAuthor: true, answer: 'Account A post.'),
        ),
        ApiSuccess(
          postDetail('1', viewerIsAuthor: true, answer: 'Account B post.'),
        ),
      ]);
      posts.updateResults
        ..clear()
        ..add(
          ApiSuccess(
            postDetail(
              '1',
              viewerIsAuthor: true,
              answer: 'Delayed account A save.',
            ),
          ),
        );
      final held = Completer<void>();
      posts.holdUpdate = held;
      final harness = harnessWith(posts);
      await openEditor(tester, harness);

      await tester.enterText(
        find.byKey(const Key('editPost.answer')),
        'Delayed account A save.',
      );
      await tester.ensureVisible(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.save')));
      await tester.pump();
      expect(posts.edits, hasLength(1));
      await replaceActor(tester, harness, 'user-2');

      expect(find.byKey(const Key('editPost.save')), findsNothing);
      held.complete();
      await tester.pumpAndSettle();

      expect(find.text('Delayed account A save.'), findsNothing);
      expect(find.text('Account B post.'), findsOneWidget);
      expect(harness.session.user?.id, 'user-2');
    });

    testWidgets('ignores a delayed account A 401 after switching to B', (
      tester,
    ) async {
      final posts = FakePostClient([
        ApiSuccess(postDetail('1', viewerIsAuthor: true)),
        ApiSuccess(
          postDetail('1', viewerIsAuthor: true, answer: 'Account B post.'),
        ),
      ]);
      posts.updateResults
        ..clear()
        ..add(const ApiError(Unauthenticated()));
      final held = Completer<void>();
      posts.holdUpdate = held;
      final harness = harnessWith(posts);
      await openEditor(tester, harness);

      await tester.enterText(find.byKey(const Key('editPost.answer')), 'Mine.');
      await tester.ensureVisible(find.byKey(const Key('editPost.save')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.save')));
      await tester.pump();
      expect(posts.edits, hasLength(1));
      await replaceActor(tester, harness, 'user-2');
      held.complete();
      await tester.pumpAndSettle();

      expect(harness.session.status, SessionStatus.signedIn);
      expect(harness.session.user?.id, 'user-2');
      expect(find.text('Account B post.'), findsOneWidget);
    });

    testWidgets('closes an editor discard dialog on account switch', (
      tester,
    ) async {
      final harness = harnessWith(
        FakePostClient([
          ApiSuccess(postDetail('1', viewerIsAuthor: true)),
          ApiSuccess(
            postDetail('1', viewerIsAuthor: true, answer: 'Account B post.'),
          ),
        ]),
      );
      await openEditor(tester, harness);
      await tester.enterText(find.byKey(const Key('editPost.answer')), 'Mine.');
      await tester.tap(find.byKey(const Key('editPost.back')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('editPost.discard')), findsOneWidget);

      await replaceActor(tester, harness, 'user-2');

      expect(find.byKey(const Key('editPost.discard')), findsNothing);
      expect(find.byKey(const Key('editPost.save')), findsNothing);
      expect(find.text('Mine.'), findsNothing);
      expect(find.text('Account B post.'), findsOneWidget);
    });

    testWidgets('clears and closes the editor on logout', (tester) async {
      final harness = harnessWith(
        FakePostClient([ApiSuccess(postDetail('1', viewerIsAuthor: true))]),
      );
      await openEditor(tester, harness);
      await tester.enterText(
        find.byKey(const Key('editPost.answer')),
        'Account A private draft.',
      );

      await harness.session.signOut();
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('editPost.save')), findsNothing);
      expect(find.text('Account A private draft.'), findsNothing);
      expect(harness.session.status, SessionStatus.signedOut);
    });

    testWidgets('asks before discarding changes', (tester) async {
      final harness = harnessWith(
        FakePostClient([ApiSuccess(postDetail('1', viewerIsAuthor: true))]),
      );
      await openEditor(tester, harness);

      await tester.enterText(find.byKey(const Key('editPost.answer')), 'Mine.');
      await tester.tap(find.byKey(const Key('editPost.back')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('editPost.discard')), findsOneWidget);

      await tester.tap(find.text('Keep editing'));
      await tester.pumpAndSettle();
      expect(find.text('Mine.'), findsOneWidget);

      await tester.tap(find.byKey(const Key('editPost.back')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('editPost.discard.confirm')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('editPost.save')), findsNothing);
      expect(find.text('Walked to the harbour.'), findsOneWidget);
      expect(harness.posts.edits, isEmpty);
    });
  });

  group('deleting', () {
    Future<void> confirmDelete(WidgetTester tester, TestHarness harness) async {
      await openPost(tester, harness);
      await tester.tap(find.byKey(const Key('post.menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('post.delete')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('post.deleteDialog')), findsOneWidget);
      await tester.tap(find.byKey(const Key('post.deleteDialog.confirm')));
      await tester.pumpAndSettle();
    }

    testWidgets('asks first, deletes, and refreshes the feed it came from', (
      tester,
    ) async {
      final harness = harnessWith(
        FakePostClient([ApiSuccess(postDetail('1', viewerIsAuthor: true))]),
      );
      var postChanges = 0;
      harness.postActivity.addListener(() => postChanges++);
      await confirmDelete(tester, harness);

      expect(harness.posts.deleted, ['1']);
      // Deleting may end a streak, so profiles reload it.
      expect(postChanges, 1);
      expect(find.byKey(const Key('post.deleted')), findsOneWidget);
      expect(find.byKey(const Key('post.menu')), findsNothing);
      expect(find.byKey(const Key('home.feed.post.1')), findsOneWidget);
      expect(harness.feed.cursors, [null, null]);
    });

    testWidgets('stays on the post when deletion fails', (tester) async {
      final harness = harnessWith(
        FakePostClient([ApiSuccess(postDetail('1', viewerIsAuthor: true))]),
      );
      harness.posts.deleteResult = const ApiError(ServiceUnavailable());
      var postChanges = 0;
      harness.postActivity.addListener(() => postChanges++);
      await confirmDelete(tester, harness);
      expect(postChanges, 0);

      expect(find.byKey(const Key('post.deleteFailed')), findsOneWidget);
      expect(find.text('Walked to the harbour.'), findsOneWidget);
    });

    testWidgets('cancelling keeps the post', (tester) async {
      final harness = harnessWith(
        FakePostClient([ApiSuccess(postDetail('1', viewerIsAuthor: true))]),
      );
      await openPost(tester, harness);
      await tester.tap(find.byKey(const Key('post.menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('post.delete')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      expect(harness.posts.deleted, isEmpty);
      expect(find.text('Walked to the harbour.'), findsOneWidget);
    });
  });

  group('earlier versions', () {
    PostRevision revision(int number, String answer) => PostRevision(
      revisionNumber: number,
      reflectiveAnswer: answer,
      caption: null,
      rating: 6,
      audience: 'friends',
      replacedAt: DateTime.utc(2026, 9, 29, 8),
    );

    testWidgets('opens from the edited marker and pages older versions', (
      tester,
    ) async {
      final posts = FakePostClient([
        ApiSuccess(postDetail('1', edited: true, revisionCount: 2)),
      ]);
      posts.revisionResults
        ..clear()
        ..addAll([
          ApiSuccess(
            PostPage(
              items: [revision(2, 'Second try.')],
              nextCursor: 'next',
              hasMore: true,
            ),
          ),
          ApiSuccess(
            PostPage(
              items: [revision(1, 'First try.')],
              nextCursor: null,
              hasMore: false,
            ),
          ),
        ]);
      final harness = harnessWith(posts);
      await openPost(tester, harness);

      await tester.tap(find.byKey(const Key('post.history')));
      await tester.pumpAndSettle();
      expect(find.text('Second try.'), findsOneWidget);
      expect(find.textContaining('Only you'), findsNothing);

      await tester.tap(find.byKey(const Key('revisions.more')));
      await tester.pumpAndSettle();
      expect(find.text('First try.'), findsOneWidget);
      expect(find.byKey(const Key('revisions.more')), findsNothing);
      expect(posts.revisionRequests, [('1', null), ('1', 'next')]);
    });

    testWidgets('discards delayed account A revisions after switching to B', (
      tester,
    ) async {
      final posts = FakePostClient([
        ApiSuccess(postDetail('1', edited: true, revisionCount: 1)),
        ApiSuccess(
          postDetail(
            '1',
            edited: true,
            revisionCount: 1,
            answer: 'Account B post.',
          ),
        ),
      ]);
      posts.revisionResults
        ..clear()
        ..add(
          ApiSuccess(
            PostPage(
              items: [revision(1, 'Account A private revision.')],
              nextCursor: null,
              hasMore: false,
            ),
          ),
        );
      final held = Completer<void>();
      posts.holdRevisions = held;
      final harness = harnessWith(posts);
      await openPost(tester, harness);

      await tester.tap(find.byKey(const Key('post.history')));
      await tester.pump();
      await replaceActor(tester, harness, 'user-2');
      expect(find.text('earlier versions'), findsNothing);

      held.complete();
      await tester.pumpAndSettle();
      expect(find.text('Account A private revision.'), findsNothing);
      expect(find.text('Account B post.'), findsOneWidget);
    });

    testWidgets('ignores a delayed revisions 401 after switching to B', (
      tester,
    ) async {
      final posts = FakePostClient([
        ApiSuccess(postDetail('1', edited: true, revisionCount: 1)),
        ApiSuccess(
          postDetail(
            '1',
            edited: true,
            revisionCount: 1,
            answer: 'Account B post.',
          ),
        ),
      ]);
      posts.revisionResults
        ..clear()
        ..add(const ApiError(Unauthenticated()));
      final held = Completer<void>();
      posts.holdRevisions = held;
      final harness = harnessWith(posts);
      await openPost(tester, harness);

      await tester.tap(find.byKey(const Key('post.history')));
      await tester.pump();
      await replaceActor(tester, harness, 'user-2');
      held.complete();
      await tester.pumpAndSettle();

      expect(harness.session.status, SessionStatus.signedIn);
      expect(harness.session.user?.id, 'user-2');
      expect(find.text('Account B post.'), findsOneWidget);
    });

    testWidgets('shows nothing once access has ended', (tester) async {
      final posts = FakePostClient([
        ApiSuccess(postDetail('1', edited: true, revisionCount: 1)),
      ]);
      posts.revisionResults
        ..clear()
        ..add(const ApiError(NotFound()));
      final harness = harnessWith(posts);
      await openPost(tester, harness);

      await tester.tap(find.byKey(const Key('post.history')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('revisions.unavailable')), findsOneWidget);
    });
  });

  testWidgets('shows one message for a missing or hidden post', (tester) async {
    final harness = harnessWith(FakePostClient([const ApiError(NotFound())]));
    await openPost(tester, harness);

    expect(find.byKey(const Key('post.unavailable')), findsOneWidget);
    expect(find.byKey(const Key('post.retry')), findsNothing);
  });

  testWidgets('retries a post that failed to load', (tester) async {
    final harness = harnessWith(
      FakePostClient([
        const ApiError(NetworkUnavailable()),
        ApiSuccess(postDetail('1', answer: 'Back online.')),
      ]),
    );
    await openPost(tester, harness);

    expect(find.byKey(const Key('post.error')), findsOneWidget);
    await tester.tap(find.byKey(const Key('post.retry')));
    await tester.pumpAndSettle();
    expect(find.text('Back online.'), findsOneWidget);
  });

  testWidgets('removes a post whose access was revoked on refresh', (
    tester,
  ) async {
    final harness = harnessWith(
      FakePostClient([
        ApiSuccess(postDetail('1', answer: 'Soon hidden.')),
        const ApiError(NotFound()),
      ]),
    );
    await openPost(tester, harness);
    expect(find.text('Soon hidden.'), findsOneWidget);

    await tester.fling(find.byType(ListView), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Soon hidden.'), findsNothing);
    expect(find.byKey(const Key('post.unavailable')), findsOneWidget);
  });

  testWidgets('keeps the post with a notice when a refresh fails', (
    tester,
  ) async {
    final harness = harnessWith(
      FakePostClient([
        ApiSuccess(postDetail('1', answer: 'Still here.')),
        const ApiError(NetworkUnavailable()),
      ]),
    );
    await openPost(tester, harness);

    await tester.fling(find.byType(ListView), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Still here.'), findsOneWidget);
    expect(find.byKey(const Key('post.stale')), findsOneWidget);
  });

  testWidgets('shows every photo in order', (tester) async {
    final harness = harnessWith(
      FakePostClient([
        ApiSuccess(
          postDetail('1', media: [attachment('m-1', 0), attachment('m-2', 1)]),
        ),
      ]),
    );
    await openPost(tester, harness);

    final first = tester.widget<PrivateImage>(
      find.byKey(const Key('post.photo.0')),
    );
    final second = tester.widget<PrivateImage>(
      find.byKey(const Key('post.photo.1')),
    );
    expect(first.media.id, 'm-1');
    expect(second.media.id, 'm-2');
    expect(first.semanticLabel, "Friend 1's photo 1 of 2");
  });

  group('a voice memo', () {
    late FakeVideoPlatform videos;

    setUp(() {
      videos = FakeVideoPlatform()..mediaDuration = const Duration(seconds: 34);
      VideoPlayerPlatform.instance = videos;
    });

    String time(WidgetTester tester) =>
        tester.widget<Text>(find.byKey(const Key('voicePlayer.time'))).data!;

    testWidgets('shows a play control with its length, and stays silent', (
      tester,
    ) async {
      final harness = harnessWith(
        FakePostClient([
          ApiSuccess(postDetail('1', voiceMemo: voiceMemoOfPost())),
        ]),
      );
      await openPost(tester, harness);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('voicePlayer')), findsOneWidget);
      expect(time(tester), '0:00 / 0:34');
      expect(videos.sources.single, 'https://storage.example.test/vm-1?sig=1');
      // Never starts by itself.
      expect(videos.calls, isNot(contains('play')));
    });

    testWidgets('plays when the play control is tapped', (tester) async {
      final harness = harnessWith(
        FakePostClient([
          ApiSuccess(postDetail('1', voiceMemo: voiceMemoOfPost())),
        ]),
      );
      await openPost(tester, harness);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('voicePlayer.toggle')));
      await tester.pump();

      expect(videos.calls, contains('play'));
    });

    testWidgets('names whose memo it is', (tester) async {
      final semantics = tester.ensureSemantics();
      final friends = harnessWith(
        FakePostClient([
          ApiSuccess(postDetail('1', voiceMemo: voiceMemoOfPost())),
        ]),
      );
      await openPost(tester, friends);
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel("Friend 1's voice memo"), findsOneWidget);
      semantics.dispose();
    });

    testWidgets('lets the author hear their own', (tester) async {
      final semantics = tester.ensureSemantics();
      final harness = harnessWith(
        FakePostClient([
          ApiSuccess(
            postDetail('1', viewerIsAuthor: true, voiceMemo: voiceMemoOfPost()),
          ),
        ]),
      );
      await openPost(tester, harness);
      await tester.pumpAndSettle();

      expect(find.bySemanticsLabel('Your voice memo'), findsOneWidget);
      semantics.dispose();
    });

    testWidgets('is absent from a post without one', (tester) async {
      final harness = harnessWith(
        FakePostClient([ApiSuccess(postDetail('1'))]),
      );
      await openPost(tester, harness);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('voicePlayer')), findsNothing);
      expect(videos.sources, isEmpty);
    });

    testWidgets('asks once for a fresh URL after the first one expired', (
      tester,
    ) async {
      videos.failures = 1;
      final harness = harnessWith(
        FakePostClient([
          ApiSuccess(postDetail('1', voiceMemo: voiceMemoOfPost())),
        ]),
      );
      harness.posts.voiceMemoResults.add(
        ApiSuccess(
          voiceMemoOfPost(url: 'https://storage.example.test/vm-1?sig=2'),
        ),
      );
      await openPost(tester, harness);
      await tester.pumpAndSettle();

      expect(harness.posts.refreshedVoiceMemos, ['1']);
      expect(videos.sources, [
        'https://storage.example.test/vm-1?sig=1',
        'https://storage.example.test/vm-1?sig=2',
      ]);
      expect(time(tester), '0:00 / 0:34');
    });

    testWidgets('says it is unavailable when access has gone', (tester) async {
      videos.failures = 1;
      final harness = harnessWith(
        FakePostClient([
          ApiSuccess(postDetail('1', voiceMemo: voiceMemoOfPost())),
        ]),
      );
      // The refresh is refused: the post was deleted or access was removed.
      await openPost(tester, harness);
      await tester.pumpAndSettle();

      expect(harness.posts.refreshedVoiceMemos, ['1']);
      expect(find.text('Voice memo unavailable'), findsOneWidget);
    });

    testWidgets('never plays from a feed card', (tester) async {
      final harness = harnessWith(
        FakePostClient([
          ApiSuccess(postDetail('1', voiceMemo: voiceMemoOfPost())),
        ]),
      );
      await signIn(tester, harness);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('home.feed.post.1')), findsOneWidget);
      expect(find.byKey(const Key('voicePlayer')), findsNothing);
      expect(videos.sources, isEmpty);
      expect(videos.calls, isNot(contains('play')));
    });
  });

  testWidgets('plays a video on the post, muted and looping', (tester) async {
    final videos = FakeVideoPlatform();
    VideoPlayerPlatform.instance = videos;
    final harness = harnessWith(
      FakePostClient([
        ApiSuccess(
          postDetail(
            '1',
            media: [attachment('m-1', 0, contentType: 'video/mp4')],
          ),
        ),
      ]),
    );
    await openPost(tester, harness);

    expect(find.byType(PrivateVideo), findsOneWidget);
    expect(videos.sources, ['https://storage.example.test/m-1?sig=1']);
    expect(videos.calls.sublist(videos.calls.length - 3), [
      'loop:true',
      'volume:0.0',
      'play',
    ]);
  });
}

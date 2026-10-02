import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/feed_client.dart';
import 'package:dayli_mobile/api/interactions_client.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/api/post_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'home_feed_test.dart' show signIn;
import 'support/fakes.dart';

PostPage<PostComment> commentPage(List<PostComment> items) =>
    PostPage(items: items, nextCursor: null, hasMore: false);

Future<TestHarness> openPost(
  WidgetTester tester, {
  bool viewerIsAuthor = false,
  int likeCount = 2,
  int commentCount = 0,
  List<PostComment> comments = const [],
  String? nextCursor,
  FakeInteractionsClient? interactions,

  /// The comment count the server reports after a comment changes.
  int? commentCountAfter,
}) async {
  final client = interactions ?? FakeInteractionsClient();
  client.commentResults
    ..clear()
    ..add(
      ApiSuccess(
        PostPage(
          items: comments,
          nextCursor: nextCursor,
          hasMore: nextCursor != null,
        ),
      ),
    );
  ApiResult<PostDetail> detail(int count) => ApiSuccess(
    postDetail(
      '1',
      viewerIsAuthor: viewerIsAuthor,
    ).copyWith(likeCount: likeCount, commentCount: count),
  );
  final harness = TestHarness(
    feed: FakeFeedClient([
      ApiSuccess(
        FeedPage(items: [feedPost('1')], nextCursor: null, hasMore: false),
      ),
    ]),
    posts: FakePostClient([
      detail(commentCount),
      if (commentCountAfter != null) detail(commentCountAfter),
    ]),
    interactions: client,
  );
  await signIn(tester, harness);
  await tester.ensureVisible(find.byKey(const Key('home.feed.post.1')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('home.feed.post.1')));
  await tester.pumpAndSettle();
  return harness;
}

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  group('likes', () {
    testWidgets('likes at once and keeps the server count', (tester) async {
      final interactions = FakeInteractionsClient()
        ..holdLike = Completer<void>()
        ..likeResults.add(
          const ApiSuccess(LikeSummary(likeCount: 5, viewerHasLiked: true)),
        );
      await openPost(tester, interactions: interactions);

      await tester.ensureVisible(find.byKey(const Key('post.like')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('post.like')));
      await tester.pump();
      expect(find.text('3 likes'), findsOneWidget);
      expect(find.byIcon(Icons.favorite_rounded), findsOneWidget);
      expect(interactions.likeRequests, [true]);

      interactions.holdLike!.complete();
      await tester.pumpAndSettle();
      expect(find.text('5 likes'), findsOneWidget);
    });

    testWidgets('puts the like back when it fails', (tester) async {
      final interactions = FakeInteractionsClient()
        ..likeResults.add(const ApiError(NetworkUnavailable()));
      await openPost(tester, interactions: interactions);

      await tapVisible(tester, find.byKey(const Key('post.like')));

      expect(find.byKey(const Key('post.likeFailed')), findsOneWidget);
      expect(find.text('2 likes'), findsOneWidget);
      expect(find.byIcon(Icons.favorite_border_rounded), findsOneWidget);
    });

    testWidgets('opens who liked the post', (tester) async {
      final interactions = FakeInteractionsClient()
        ..likesResult = ApiSuccess(
          PostPage(
            items: [
              PostLike(
                person: const InteractionPerson(
                  id: 'user-ben',
                  username: 'ben',
                  displayName: 'Ben',
                ),
                likedAt: DateTime.utc(2026, 9, 29),
              ),
            ],
            nextCursor: null,
            hasMore: false,
          ),
        );
      await openPost(tester, interactions: interactions);

      await tapVisible(tester, find.byKey(const Key('post.likes')));

      expect(find.byKey(const Key('likers.user-ben')), findsOneWidget);
      expect(find.text('@ben'), findsOneWidget);
    });
  });

  group('comments', () {
    testWidgets('shows replies under their comment', (tester) async {
      await openPost(
        tester,
        commentCount: 2,
        comments: [
          postComment('c-1'),
          postComment(
            'c-2',
            parentCommentId: 'c-1',
            author: 'ana',
            text: 'Thanks!',
          ),
        ],
      );

      await tester.ensureVisible(find.byKey(const Key('comment.c-2')));
      expect(find.text('Beautiful.'), findsOneWidget);
      expect(find.text('Thanks!'), findsOneWidget);
      expect(find.text('2 comments'), findsOneWidget);
      expect(find.byKey(const Key('comment.c-1.reply')), findsOneWidget);
      expect(find.byKey(const Key('comment.c-2.reply')), findsNothing);
    });

    testWidgets('keeps the text and its ID for a retry after a failure', (
      tester,
    ) async {
      final interactions = FakeInteractionsClient()
        ..createResults.addAll([
          const ApiError(NetworkUnavailable()),
          ApiSuccess(postComment('c-9', author: 'jos', text: 'Lovely.')),
        ]);
      await openPost(tester, interactions: interactions, commentCountAfter: 1);

      await tester.ensureVisible(find.byKey(const Key('comments.input')));
      await tester.enterText(
        find.byKey(const Key('comments.input')),
        'Lovely.',
      );
      await tapVisible(tester, find.byKey(const Key('comments.send')));

      expect(find.byKey(const Key('comments.sendError')), findsOneWidget);
      expect(find.text('Lovely.'), findsOneWidget);

      await tapVisible(tester, find.byKey(const Key('comments.send')));

      expect(interactions.created, hasLength(2));
      expect(
        interactions.created.last.clientCommentId,
        interactions.created.first.clientCommentId,
      );
      expect(find.byKey(const Key('comment.c-9')), findsOneWidget);
      expect(find.byKey(const Key('comments.sendError')), findsNothing);
      expect(find.text('1 comment'), findsOneWidget);
    });

    testWidgets('keeps a new comment after older unloaded ones', (
      tester,
    ) async {
      final interactions = FakeInteractionsClient()
        ..createResults.add(ApiSuccess(postComment('c-9', text: 'Lovely.')));
      await openPost(
        tester,
        commentCount: 30,
        comments: [postComment('c-1')],
        nextCursor: 'next',
        interactions: interactions,
      );

      await tester.ensureVisible(find.byKey(const Key('comments.input')));
      await tester.enterText(
        find.byKey(const Key('comments.input')),
        'Lovely.',
      );
      await tapVisible(tester, find.byKey(const Key('comments.send')));

      expect(find.byKey(const Key('comments.postedOutOfView')), findsOneWidget);
      expect(find.byKey(const Key('comment.c-9')), findsNothing);
    });

    testWidgets('uses a new ID when the reply target changes after a failure', (
      tester,
    ) async {
      final interactions = FakeInteractionsClient()
        ..createResults.addAll([
          const ApiError(NetworkUnavailable()),
          ApiSuccess(postComment('c-9', text: 'Agreed.')),
        ]);
      await openPost(
        tester,
        commentCount: 1,
        comments: [postComment('c-1')],
        interactions: interactions,
      );

      await tapVisible(tester, find.byKey(const Key('comment.c-1.reply')));
      await tester.enterText(
        find.byKey(const Key('comments.input')),
        'Agreed.',
      );
      await tapVisible(tester, find.byKey(const Key('comments.send')));
      expect(find.byKey(const Key('comments.sendError')), findsOneWidget);

      await tapVisible(tester, find.byKey(const Key('comments.cancelReply')));
      expect(find.byKey(const Key('comments.sendError')), findsNothing);
      await tapVisible(tester, find.byKey(const Key('comments.send')));

      expect(interactions.created.first.parentCommentId, 'c-1');
      expect(interactions.created.last.parentCommentId, isNull);
      expect(
        interactions.created.last.clientCommentId,
        isNot(interactions.created.first.clientCommentId),
      );
    });

    testWidgets('replies to a comment', (tester) async {
      final interactions = FakeInteractionsClient()
        ..createResults.add(
          ApiSuccess(
            postComment('c-2', parentCommentId: 'c-1', text: 'Agreed.'),
          ),
        );
      await openPost(
        tester,
        commentCount: 1,
        comments: [postComment('c-1')],
        interactions: interactions,
      );

      await tapVisible(tester, find.byKey(const Key('comment.c-1.reply')));
      expect(find.text('Replying to Ben'), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('comments.input')),
        'Agreed.',
      );
      await tapVisible(tester, find.byKey(const Key('comments.send')));

      expect(interactions.created.single.parentCommentId, 'c-1');
      expect(find.byKey(const Key('comment.c-2')), findsOneWidget);
      expect(find.text('Replying to Ben'), findsNothing);
    });

    testWidgets('edits your own comment', (tester) async {
      final interactions = FakeInteractionsClient()
        ..updateResult = ApiSuccess(
          postComment(
            'c-1',
            text: 'Stunning.',
            viewerCanEdit: true,
            viewerCanDelete: true,
            editedAt: DateTime.utc(2026, 9, 30),
          ),
        );
      await openPost(
        tester,
        commentCount: 1,
        comments: [
          postComment('c-1', viewerCanEdit: true, viewerCanDelete: true),
        ],
        interactions: interactions,
      );

      await tapVisible(tester, find.byKey(const Key('comment.c-1.menu')));
      await tester.tap(find.byKey(const Key('comment.edit')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('comment.edit.input')),
        'Stunning.',
      );
      await tester.tap(find.byKey(const Key('comment.edit.save')));
      await tester.pumpAndSettle();

      expect(interactions.updates.single, ('c-1', 'Stunning.'));
      expect(find.text('Stunning.'), findsOneWidget);
      expect(find.textContaining('edited'), findsOneWidget);
    });

    testWidgets('lets the post author delete a comment and its replies', (
      tester,
    ) async {
      final interactions = FakeInteractionsClient();
      await openPost(
        tester,
        viewerIsAuthor: true,
        commentCount: 5,
        commentCountAfter: 0,
        comments: [
          postComment('c-1', viewerCanDelete: true),
          postComment('c-2', parentCommentId: 'c-1', author: 'cy'),
        ],
        interactions: interactions,
      );

      await tapVisible(tester, find.byKey(const Key('comment.c-1.menu')));
      expect(find.byKey(const Key('comment.edit')), findsNothing);
      await tester.tap(find.byKey(const Key('comment.delete')));
      await tester.pumpAndSettle();
      expect(find.text('Delete this comment and its replies?'), findsOneWidget);
      await tester.tap(find.byKey(const Key('comment.deleteDialog.confirm')));
      await tester.pumpAndSettle();

      expect(interactions.deletedComments, ['c-1']);
      expect(find.byKey(const Key('comment.c-1')), findsNothing);
      expect(find.byKey(const Key('comment.c-2')), findsNothing);
      expect(find.text('0 comments'), findsOneWidget);
    });

    testWidgets('shows no options on someone else\'s comment', (tester) async {
      await openPost(tester, commentCount: 1, comments: [postComment('c-1')]);

      await tester.ensureVisible(find.byKey(const Key('comment.c-1')));
      expect(find.byKey(const Key('comment.c-1.menu')), findsNothing);
    });
  });
}

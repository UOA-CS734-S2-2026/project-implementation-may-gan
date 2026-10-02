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

  /// What reading the post returns after a comment changes, if not a count.
  ApiResult<PostDetail>? detailAfter,

  /// Replaces the post reads above, for tests that answer them by hand.
  FakePostClient? posts,
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
    posts:
        posts ??
        FakePostClient([
          detail(commentCount),
          if (commentCountAfter != null) detail(commentCountAfter),
          ?detailAfter,
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

ApiResult<PostDetail> withComments(int count) =>
    ApiSuccess(postDetail('1').copyWith(likeCount: 2, commentCount: count));

/// Answers the first read of the post at once and holds every later read
/// until the test answers it, in whatever order it chooses.
class GatedPostClient extends FakePostClient {
  GatedPostClient() : super([withComments(0)]);

  final gates = <Completer<ApiResult<PostDetail>>>[];

  @override
  Future<ApiResult<PostDetail>> get(String postId) {
    if (requested.isEmpty) return super.get(postId);
    requested.add(postId);
    final gate = Completer<ApiResult<PostDetail>>();
    gates.add(gate);
    return gate.future;
  }
}

Future<void> sendComment(WidgetTester tester, String text) async {
  await tester.ensureVisible(find.byKey(const Key('comments.input')));
  await tester.enterText(find.byKey(const Key('comments.input')), text);
  await tapVisible(tester, find.byKey(const Key('comments.send')));
}

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('shows likes and comments on feed cards', (tester) async {
    final semantics = tester.ensureSemantics();
    final harness = TestHarness(
      feed: FakeFeedClient([
        ApiSuccess(
          FeedPage(
            items: [
              feedPost(
                '1',
                likeCount: 3,
                viewerHasLiked: true,
                commentCount: 1,
              ),
            ],
            nextCursor: null,
            hasMore: false,
          ),
        ),
      ]),
    );
    await signIn(tester, harness);

    expect(
      find.bySemanticsLabel('3 likes, including yours, 1 comment'),
      findsOneWidget,
    );
    semantics.dispose();
  });

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

    testWidgets('shows a new comment after older unloaded ones, then once', (
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
      // The first page was already read; the next read is the older page.
      interactions.commentResults
        ..clear()
        ..add(
          ApiSuccess(
            commentPage([
              postComment('c-5', text: 'Older.'),
              postComment('c-9'),
            ]),
          ),
        );

      await tester.ensureVisible(find.byKey(const Key('comments.input')));
      await tester.enterText(
        find.byKey(const Key('comments.input')),
        'Lovely.',
      );
      await tapVisible(tester, find.byKey(const Key('comments.send')));

      expect(find.byKey(const Key('comments.postedOutOfView')), findsOneWidget);
      expect(
        tester.getTopLeft(find.byKey(const Key('comment.c-9'))).dy,
        greaterThan(
          tester.getTopLeft(find.byKey(const Key('comments.more'))).dy,
        ),
      );

      await tapVisible(tester, find.byKey(const Key('comments.more')));

      expect(find.byKey(const Key('comment.c-9')), findsOneWidget);
      expect(
        tester.getTopLeft(find.byKey(const Key('comment.c-9'))).dy,
        greaterThan(tester.getTopLeft(find.byKey(const Key('comment.c-5'))).dy),
      );
    });

    testWidgets(
      'shows a reply under its comment while older pages are unloaded',
      (tester) async {
        final interactions = FakeInteractionsClient()
          ..createResults.add(
            ApiSuccess(
              postComment('c-9', parentCommentId: 'c-1', text: 'Agreed.'),
            ),
          );
        await openPost(
          tester,
          commentCount: 30,
          comments: [postComment('c-1')],
          nextCursor: 'next',
          interactions: interactions,
        );

        await tapVisible(tester, find.byKey(const Key('comment.c-1.reply')));
        await tester.enterText(
          find.byKey(const Key('comments.input')),
          'Agreed.',
        );
        await tapVisible(tester, find.byKey(const Key('comments.send')));

        final reply = tester
            .getTopLeft(find.byKey(const Key('comment.c-9')))
            .dy;
        expect(
          reply,
          greaterThan(
            tester.getTopLeft(find.byKey(const Key('comment.c-1'))).dy,
          ),
        );
        expect(
          reply,
          lessThan(
            tester.getTopLeft(find.byKey(const Key('comments.more'))).dy,
          ),
        );
        expect(find.byKey(const Key('comments.postedOutOfView')), findsNothing);
      },
    );

    testWidgets('counts characters the way the API does', (tester) async {
      final interactions = FakeInteractionsClient();
      await openPost(tester, interactions: interactions);

      // Each family emoji is one grapheme but five code points.
      await tester.ensureVisible(find.byKey(const Key('comments.input')));
      await tester.enterText(
        find.byKey(const Key('comments.input')),
        '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}' * 201,
      );
      await tester.pump();

      expect(find.text('Keep it to 1000 characters.'), findsOneWidget);
      await tapVisible(tester, find.byKey(const Key('comments.send')));
      expect(interactions.created, isEmpty);
    });

    testWidgets('keeps an in-flight like when the comment count refreshes', (
      tester,
    ) async {
      final interactions = FakeInteractionsClient()
        ..holdLike = Completer<void>()
        ..likeResults.add(
          const ApiSuccess(LikeSummary(likeCount: 3, viewerHasLiked: true)),
        )
        ..createResults.add(ApiSuccess(postComment('c-9', text: 'Lovely.')));
      // The refreshed post was read before the like was saved.
      await openPost(tester, interactions: interactions, commentCountAfter: 1);

      await tapVisible(tester, find.byKey(const Key('post.like')));
      expect(find.text('3 likes'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('comments.input')));
      await tester.enterText(
        find.byKey(const Key('comments.input')),
        'Lovely.',
      );
      await tapVisible(tester, find.byKey(const Key('comments.send')));

      expect(find.text('1 comment'), findsOneWidget);
      expect(find.text('3 likes'), findsOneWidget);
      expect(find.byIcon(Icons.favorite_rounded), findsOneWidget);

      interactions.holdLike!.complete();
      await tester.pumpAndSettle();
      expect(find.text('3 likes'), findsOneWidget);
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

    testWidgets('says the post is unavailable when it went during a delete', (
      tester,
    ) async {
      final interactions = FakeInteractionsClient()
        ..deleteResult = const ApiError(NotFound());
      await openPost(
        tester,
        viewerIsAuthor: true,
        commentCount: 1,
        comments: [postComment('c-1', viewerCanDelete: true)],
        detailAfter: const ApiError(NotFound()),
        interactions: interactions,
      );

      await tapVisible(tester, find.byKey(const Key('comment.c-1.menu')));
      await tester.tap(find.byKey(const Key('comment.delete')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('comment.deleteDialog.confirm')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('post.unavailable')), findsOneWidget);
      expect(find.byKey(const Key('comments')), findsNothing);
    });

    testWidgets('keeps the newest count when an older read answers last', (
      tester,
    ) async {
      final posts = GatedPostClient();
      final interactions = FakeInteractionsClient()
        ..createResults.addAll([
          ApiSuccess(postComment('c-1', text: 'One.')),
          ApiSuccess(postComment('c-2', text: 'Two.')),
        ]);
      await openPost(tester, interactions: interactions, posts: posts);

      await sendComment(tester, 'One.');
      await sendComment(tester, 'Two.');
      expect(posts.gates, hasLength(2));

      posts.gates[1].complete(withComments(2));
      await tester.pumpAndSettle();
      expect(find.text('2 comments'), findsOneWidget);

      // The read from before the second comment answers late.
      posts.gates[0].complete(withComments(1));
      await tester.pumpAndSettle();
      expect(find.text('2 comments'), findsOneWidget);
    });

    testWidgets('keeps the count right when a new comment is deleted at once', (
      tester,
    ) async {
      final posts = GatedPostClient();
      final interactions = FakeInteractionsClient()
        ..createResults.add(
          ApiSuccess(postComment('c-9', text: 'Oops.', viewerCanDelete: true)),
        );
      await openPost(tester, interactions: interactions, posts: posts);

      await sendComment(tester, 'Oops.');
      await tapVisible(tester, find.byKey(const Key('comment.c-9.menu')));
      await tester.tap(find.byKey(const Key('comment.delete')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('comment.deleteDialog.confirm')));
      await tester.pumpAndSettle();
      expect(interactions.deletedComments, ['c-9']);
      expect(posts.gates, hasLength(2));

      posts.gates[1].complete(withComments(0));
      await tester.pumpAndSettle();
      posts.gates[0].complete(withComments(1));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('comment.c-9')), findsNothing);
      expect(find.text('0 comments'), findsOneWidget);
    });

    testWidgets('ignores an older 404 while a newer read is pending', (
      tester,
    ) async {
      final posts = GatedPostClient();
      final interactions = FakeInteractionsClient()
        ..createResults.addAll([
          ApiSuccess(postComment('c-1', text: 'One.')),
          ApiSuccess(postComment('c-2', text: 'Two.')),
        ]);
      await openPost(tester, interactions: interactions, posts: posts);

      await sendComment(tester, 'One.');
      await sendComment(tester, 'Two.');

      posts.gates[0].complete(const ApiError(NotFound()));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('post.unavailable')), findsNothing);
      expect(find.byKey(const Key('comments')), findsOneWidget);

      posts.gates[1].complete(withComments(2));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('post.unavailable')), findsNothing);
      expect(find.text('2 comments'), findsOneWidget);
    });

    testWidgets('shows no options on someone else\'s comment', (tester) async {
      await openPost(tester, commentCount: 1, comments: [postComment('c-1')]);

      await tester.ensureVisible(find.byKey(const Key('comment.c-1')));
      expect(find.byKey(const Key('comment.c-1.menu')), findsNothing);
    });
  });
}

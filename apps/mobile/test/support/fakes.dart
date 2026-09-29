import 'dart:convert';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/api/posting_day_client.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/compose/media_picker.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/drafts/draft_store.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class FakeFriendsClient implements FriendsClient {
  static const emptyFriends = FriendPage(
    items: [],
    nextCursor: null,
    hasMore: false,
  );
  static const emptyRequests = FriendRequestPage(
    items: [],
    nextCursor: null,
    hasMore: false,
  );
  @override
  Future<ApiResult<FriendsSnapshot>> load() async => const ApiSuccess(
    FriendsSnapshot(
      friends: emptyFriends,
      incoming: emptyRequests,
      outgoing: emptyRequests,
    ),
  );
  @override
  Future<ApiResult<FriendPage>> loadFriends({String? cursor}) async =>
      const ApiSuccess(emptyFriends);
  @override
  Future<ApiResult<FriendRequestPage>> loadRequests(
    String direction, {
    String? cursor,
  }) async => const ApiSuccess(emptyRequests);
  @override
  Future<ApiResult<FriendPage>> search(String query, {String? cursor}) async =>
      const ApiSuccess(emptyFriends);
  @override
  Future<ApiResult<void>> send(String userId) async => const ApiSuccess(null);
  @override
  Future<ApiResult<void>> accept(String requestId) async =>
      const ApiSuccess(null);
  @override
  Future<ApiResult<void>> decline(String requestId) async =>
      const ApiSuccess(null);
  @override
  Future<ApiResult<void>> cancel(String requestId) async =>
      const ApiSuccess(null);
  @override
  Future<ApiResult<void>> remove(String userId) async => const ApiSuccess(null);
}

class MemoryTokenStore implements SessionTokenStore {
  String? value;
  String? pendingRevocation;

  @override
  Future<void> clear() async => value = null;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String token) async => value = token;

  @override
  Future<String?> readPendingRevocation() async => pendingRevocation;

  @override
  Future<void> clearPendingRevocation() async => pendingRevocation = null;

  @override
  Future<void> quarantineActiveToken() async {
    final token = value;
    if (token == null) return;
    pendingRevocation = token;
    value = null;
  }
}

class MemoryUserCache implements SessionUserCache {
  SessionUser? value;

  @override
  Future<void> clear() async => value = null;

  @override
  Future<SessionUser?> read() async => value;

  @override
  Future<void> write(SessionUser user) async => value = user;
}

class MemoryDraftStore implements DraftStore {
  final drafts = <String, DailyPostDraft>{};
  int writes = 0;

  @override
  Future<void> clear(String userId) async => drafts.remove(userId);

  @override
  Future<DraftReadResult> read(String userId) async =>
      DraftReadResult(drafts[userId]);

  @override
  Future<void> write(DailyPostDraft draft) async {
    writes++;
    drafts[draft.userId] = draft;
  }
}

class FakeMediaPicker implements MediaPicker {
  var picks = 0;

  @override
  Future<DraftAttachment?> pickPhoto() async => _next();

  @override
  Future<DraftAttachment?> pickPhotoOrVideo() async => _next();

  DraftAttachment _next() =>
      DraftAttachment(localPath: '/photos/${picks++}.jpg', mediaType: 'image');
}

class FakePostingDayClient implements PostingDayClient {
  FakePostingDayClient(this.result);

  ApiResult<PostingDay> result;
  int calls = 0;

  @override
  Future<ApiResult<PostingDay>> current() async {
    calls++;
    return result;
  }
}

class FakeSubmitter implements DailyPostSubmitter {
  FakeSubmitter(this.result);

  SubmissionResult result;
  final submitted = <DailyPostDraft>[];

  @override
  Future<SubmissionResult> submit(DailyPostDraft draft) async {
    submitted.add(draft);
    return result;
  }
}

PostingDay postingDay({
  String localDate = '2026-09-25',
  String promptId = 'prompt-09-25',
  String promptText = 'What made you smile today?',
  bool hasPosted = false,
}) => PostingDay(
  serverNow: DateTime.utc(2026, 9, 25, 3),
  localDate: localDate,
  deadlineAt: DateTime.utc(2026, 9, 25, 12),
  promptId: promptId,
  promptText: promptText,
  hasPosted: hasPosted,
);

/// A signed-out-by-default app wired to in-memory fakes. A Better Auth mock
/// accepts `jos@example.test` / `correct-password`.
class TestHarness {
  TestHarness({
    ApiResult<PostingDay>? day,
    SubmissionResult? submission,
    FriendsClient? friends,
  }) : friends = friends ?? FakeFriendsClient(),
       postingDays = FakePostingDayClient(day ?? ApiSuccess(postingDay())),
       submitter = FakeSubmitter(
         submission ??
             const SubmissionAccepted(postId: 'post-1', replayed: false),
       ) {
    final client = MockClient((request) async {
      final path = request.url.path;
      if (path.endsWith('/sign-in/email')) {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        return body['password'] == 'correct-password'
            ? http.Response('{}', 200, headers: {'set-auth-token': 'token-1'})
            : http.Response('{}', 401);
      }
      if (path.endsWith('/get-session')) {
        return request.headers['authorization'] == 'Bearer token-1'
            ? http.Response(
                jsonEncode({
                  'user': {
                    'id': 'user-1',
                    'name': 'Jos',
                    'email': 'jos@example.test',
                    'username': 'jos',
                  },
                  'session': {'id': 's1'},
                }),
                200,
              )
            : http.Response('null', 200);
      }
      if (path.endsWith('/sign-out')) return http.Response('{}', 200);
      return http.Response('{}', 404);
    });
    session = SessionController(
      session: BetterAuthNativeSession(
        baseUrl: 'https://api.example.test',
        tokenStore: tokens,
        client: client,
      ),
      tokenStore: tokens,
      userCache: users,
      drafts: drafts,
    );
  }

  final tokens = MemoryTokenStore();
  final users = MemoryUserCache();
  final drafts = MemoryDraftStore();
  final FakePostingDayClient postingDays;
  final FriendsClient friends;
  final FakeSubmitter submitter;
  final mediaPicker = FakeMediaPicker();
  late final SessionController session;

  AppServices get services => AppServices(
    session: session,
    postingDays: postingDays,
    friends: friends,
    drafts: drafts,
    submitter: submitter,
    mediaPicker: mediaPicker,
    clock: () => DateTime.utc(2026, 9, 25, 3),
  );
}

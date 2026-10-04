import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/feed_client.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/api/post_media.dart';
import 'package:dayli_mobile/api/post_page.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/api/interactions_client.dart';
import 'package:dayli_mobile/api/media_upload_client.dart';
import 'package:dayli_mobile/api/posting_day_client.dart';
import 'package:dayli_mobile/api/profile_client.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/compose/media_compressor.dart';
import 'package:dayli_mobile/compose/media_picker.dart';
import 'package:dayli_mobile/compose/pending_capture.dart';
import 'package:dayli_mobile/compose/voice_recorder.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/drafts/draft_store.dart';
import 'package:dayli_mobile/posts/post_activity.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
import 'package:dayli_mobile/settings/account_export_client.dart';
import 'package:dayli_mobile/profile/streak_cache.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart' show TestWidgetsFlutterBinding;
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

import 'voice_fakes.dart';

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
  Future<ApiResult<FriendCard>> profile(String username) async =>
      const ApiError(ServiceUnavailable());
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

class MemoryPendingCaptureStore implements PendingCaptureStore {
  PendingCapture? value;

  @override
  Future<void> clear() async => value = null;

  @override
  Future<PendingCapture?> read() async => value;

  @override
  Future<void> write(PendingCapture capture) async => value = capture;
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
  var captures = 0;
  var settingsOpened = 0;

  /// Queue outcomes to script the camera; otherwise each capture succeeds.
  final captureOutcomes = <CaptureOutcome>[];

  /// What [recoverLostCapture] returns once.
  DraftAttachment? lostCapture;

  /// Runs while the camera or library is open, so a test can see what the app
  /// recorded about the pick before the result came back.
  void Function()? whileOpen;

  @override
  Future<DraftAttachment?> pickPhoto() async {
    whileOpen?.call();
    return _next();
  }

  @override
  Future<DraftAttachment?> pickPhotoOrVideo() async {
    whileOpen?.call();
    return _next();
  }

  @override
  Future<CaptureOutcome> capturePhoto() async {
    whileOpen?.call();
    return _capture('image', 'jpg');
  }

  @override
  Future<CaptureOutcome> captureVideo() async {
    whileOpen?.call();
    return _capture('video', 'mp4');
  }

  @override
  Future<DraftAttachment?> recoverLostCapture() async {
    final lost = lostCapture;
    lostCapture = null;
    return lost;
  }

  @override
  Future<bool> openSettings() async {
    settingsOpened++;
    return true;
  }

  CaptureOutcome _capture(String mediaType, String extension) {
    final number = captures++;
    if (captureOutcomes.isNotEmpty) return captureOutcomes.removeAt(0);
    return Captured(
      DraftAttachment(
        localPath: '/camera/$number.$extension',
        mediaType: mediaType,
      ),
    );
  }

  DraftAttachment _next() =>
      DraftAttachment(localPath: '/photos/${picks++}.jpg', mediaType: 'image');
}

/// Compresses instantly. Queue [results] to script outcomes; otherwise each
/// photo becomes a 1000-byte JPEG and each video a 2000-byte MP4.
class FakeMediaCompressor implements MediaCompressor {
  final results = <CompressionResult>[];
  final compressed = <DraftAttachment>[];
  final owners = <String>[];
  final discarded = <String>[];
  final discardedOwners = <String>[];

  @override
  Future<CompressionResult> compress(
    DraftAttachment attachment, {
    required String ownerId,
  }) async {
    compressed.add(attachment);
    owners.add(ownerId);
    if (results.isNotEmpty) return results.removeAt(0);
    final video = attachment.mediaType == 'video';
    return CompressionSucceeded(
      CompressedMedia(
        path:
            '/support/dayli-media/${compressed.length}.${video ? 'mp4' : 'jpg'}',
        contentType: video ? 'video/mp4' : 'image/jpeg',
        byteSize: video ? 2000 : 1000,
        videoDuration: video ? const Duration(seconds: 5) : null,
      ),
    );
  }

  @override
  Future<void> discard(String compressedPath) async =>
      discarded.add(compressedPath);

  /// Runs when [discardAll] is called, to check the state at that moment.
  void Function(String ownerId)? onDiscardAll;
  bool failDiscardAll = false;

  @override
  Future<void> discardAll(String ownerId) async {
    onDiscardAll?.call(ownerId);
    if (failDiscardAll) throw const FileSystemException('Permission denied');
    discardedOwners.add(ownerId);
  }
}

/// Records calls and succeeds by default. Queue results per step to script
/// failures; each queue is consumed in order.
class FakeMediaUploadClient implements MediaUploadClient {
  final reserveResults = <ApiResult<MediaUploadTicket>>[];
  final uploadResults = <ApiResult<void>>[];
  final completeResults = <ApiResult<MediaCheck>>[];

  final reserved = <({String contentType, int byteSize})>[];
  final uploaded = <({String reservationId, String path})>[];
  final completed = <String>[];

  @override
  Future<ApiResult<MediaUploadTicket>> reserve({
    required String contentType,
    required int byteSize,
  }) async {
    reserved.add((contentType: contentType, byteSize: byteSize));
    if (reserveResults.isNotEmpty) return reserveResults.removeAt(0);
    return ApiSuccess(
      MediaUploadTicket(
        reservationId: 'reservation-${reserved.length}',
        url: Uri.parse('https://storage.example.test/${reserved.length}'),
        requiredHeaders: {
          'content-type': contentType,
          'content-length': '$byteSize',
          'if-none-match': '*',
        },
      ),
    );
  }

  @override
  Future<ApiResult<void>> upload(MediaUploadTicket ticket, String path) async {
    uploaded.add((reservationId: ticket.reservationId, path: path));
    if (uploadResults.isNotEmpty) return uploadResults.removeAt(0);
    return const ApiSuccess(null);
  }

  @override
  Future<ApiResult<MediaCheck>> complete(String reservationId) async {
    completed.add(reservationId);
    if (completeResults.isNotEmpty) return completeResults.removeAt(0);
    return const ApiSuccess(MediaCheck(MediaCheckStatus.validated));
  }
}

class FakeFeedClient implements FeedClient {
  FakeFeedClient([List<ApiResult<FeedPage>>? results])
    : results =
          results ??
          [
            const ApiSuccess(
              FeedPage(items: [], nextCursor: null, hasMore: false),
            ),
          ];

  /// Returned in order; the last result repeats.
  final List<ApiResult<FeedPage>> results;
  final cursors = <String?>[];

  @override
  Future<ApiResult<FeedPage>> page({String? cursor}) async {
    cursors.add(cursor);
    return results.length > 1 ? results.removeAt(0) : results.single;
  }
}

FeedPost feedPost(
  String id, {
  String answer = 'Walked to the harbour.',
  String? caption,
  List<PostMedia> media = const [],
  int likeCount = 0,
  bool viewerHasLiked = false,
  int commentCount = 0,
}) => FeedPost(
  id: id,
  authorId: 'author-$id',
  username: 'friend_$id',
  displayName: 'Friend $id',
  localDate: '2026-09-24',
  promptText: 'What made you smile today?',
  reflectiveAnswer: answer,
  caption: caption,
  rating: 7,
  acceptedAt: DateTime.utc(2026, 9, 24, 3),
  edited: false,
  likeCount: likeCount,
  viewerHasLiked: viewerHasLiked,
  commentCount: commentCount,
  media: media,
);

class FakePostClient implements PostClient {
  FakePostClient([
    List<ApiResult<PostDetail>>? results,
    List<ApiResult<ProfilePostsPage>>? profileResults,
  ]) : results = results ?? [const ApiError(NotFound())],
       profileResults =
           profileResults ??
           [
             const ApiSuccess(
               ProfilePostsPage(items: [], nextCursor: null, hasMore: false),
             ),
           ];

  /// Returned in order; the last result repeats.
  final List<ApiResult<PostDetail>> results;
  final List<ApiResult<ProfilePostsPage>> profileResults;
  final requested = <String>[];
  final profileRequests = <(String, String?)>[];

  @override
  Future<ApiResult<ProfilePostsPage>> profilePage(
    String username, {
    String? cursor,
  }) async {
    profileRequests.add((username, cursor));
    return profileResults.length > 1
        ? profileResults.removeAt(0)
        : profileResults.single;
  }

  @override
  Future<ApiResult<PostDetail>> get(String postId) async {
    requested.add(postId);
    return results.length > 1 ? results.removeAt(0) : results.single;
  }

  /// Refresh results in order; refused once they run out.
  final mediaResults = <ApiResult<PostMedia>>[];
  final refreshed = <({String postId, String mediaId})>[];

  @override
  Future<ApiResult<PostMedia>> media(String postId, String mediaId) async {
    refreshed.add((postId: postId, mediaId: mediaId));
    return mediaResults.isEmpty
        ? const ApiError(NotFound())
        : mediaResults.removeAt(0);
  }

  /// Voice memo refresh results in order; refused once they run out.
  final voiceMemoResults = <ApiResult<PostVoiceMemo>>[];
  final refreshedVoiceMemos = <String>[];

  @override
  Future<ApiResult<PostVoiceMemo>> voiceMemo(String postId) async {
    refreshedVoiceMemos.add(postId);
    return voiceMemoResults.isEmpty
        ? const ApiError(NotFound())
        : voiceMemoResults.removeAt(0);
  }

  /// Edit results in order; the last repeats.
  final updateResults = <ApiResult<PostDetail>>[
    const ApiError(ServiceUnavailable()),
  ];
  final edits = <(String, PostEdit)>[];

  /// Completes each edit when set, so a test can look at the saving state.
  Completer<void>? holdUpdate;

  @override
  Future<ApiResult<PostDetail>> update(String postId, PostEdit edit) async {
    edits.add((postId, edit));
    await holdUpdate?.future;
    return updateResults.length > 1
        ? updateResults.removeAt(0)
        : updateResults.single;
  }

  ApiResult<void> deleteResult = const ApiSuccess(null);
  final deleted = <String>[];

  @override
  Future<ApiResult<void>> delete(String postId) async {
    deleted.add(postId);
    return deleteResult;
  }

  /// Revision pages in order; the last repeats.
  final revisionResults = <ApiResult<PostPage<PostRevision>>>[
    const ApiSuccess(PostPage(items: [], nextCursor: null, hasMore: false)),
  ];
  final revisionRequests = <(String, String?)>[];

  /// Completes revision reads when set, so tests can switch session mid-load.
  Completer<void>? holdRevisions;

  @override
  Future<ApiResult<PostPage<PostRevision>>> revisions(
    String postId, {
    String? cursor,
  }) async {
    revisionRequests.add((postId, cursor));
    await holdRevisions?.future;
    return revisionResults.length > 1
        ? revisionResults.removeAt(0)
        : revisionResults.single;
  }
}

ProfilePost profilePost(
  String id, {
  String answer = 'Walked to the harbour.',
  String username = 'ada',
  String displayName = 'Ada',
  String audience = 'friends',
  bool released = true,
  int likeCount = 0,
  bool viewerHasLiked = false,
}) => ProfilePost(
  id: id,
  authorId: 'author-$username',
  username: username,
  displayName: displayName,
  localDate: '2026-09-25',
  promptText: 'What made you smile today?',
  reflectiveAnswer: answer,
  caption: null,
  rating: 7,
  acceptedAt: DateTime.utc(2026, 9, 25, 3),
  edited: false,
  likeCount: likeCount,
  viewerHasLiked: viewerHasLiked,
  audience: audience,
  released: released,
);

PostDetail postDetail(
  String id, {
  String answer = 'Walked to the harbour.',
  String? caption,
  String audience = 'friends',
  bool viewerIsAuthor = false,
  bool edited = false,
  int revisionCount = 0,
  int rating = 8,
  List<PostMedia> media = const [],
  PostVoiceMemo? voiceMemo,
}) => PostDetail(
  id: id,
  authorId: 'author-$id',
  username: 'friend_$id',
  displayName: 'Friend $id',
  localDate: '2026-09-29',
  promptText: 'What made you smile today?',
  reflectiveAnswer: answer,
  caption: caption,
  rating: rating,
  audience: audience,
  acceptedAt: DateTime.utc(2026, 9, 29, 3),
  edited: edited,
  viewerIsAuthor: viewerIsAuthor,
  revisionCount: revisionCount,
  media: media,
  voiceMemo: voiceMemo,
);

/// A signed voice memo for widget tests.
PostVoiceMemo voiceMemoOfPost({
  String id = 'vm-1',
  String url = 'https://storage.example.test/vm-1?sig=1',
}) => PostVoiceMemo(
  id: id,
  contentType: 'audio/mp4',
  url: Uri.parse(url),
  expiresAt: DateTime.utc(2026, 9, 30, 3, 5),
);

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

  /// When set, submissions stay in flight until this completes.
  Completer<SubmissionResult>? hold;

  @override
  Future<SubmissionResult> submit(DailyPostDraft draft) async {
    submitted.add(draft);
    final pending = hold;
    return pending == null ? result : pending.future;
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
    FakeFeedClient? feed,
    FakePostClient? posts,
    this.uploadMedia = true,
    this.effectiveTerms = false,
    this.accountExports,
    FakeProfileClient? profiles,
    FakeInteractionsClient? interactions,
    this.google,
  }) : friends = friends ?? FakeFriendsClient(),
       interactions = interactions ?? FakeInteractionsClient(),
       profiles = profiles ?? FakeProfileClient(),
       feed = feed ?? FakeFeedClient(),
       posts = posts ?? FakePostClient(),
       postingDays = FakePostingDayClient(day ?? ApiSuccess(postingDay())),
       submitter = FakeSubmitter(
         submission ??
             const SubmissionAccepted(postId: 'post-1', replayed: false),
       ) {
    final client = MockClient((request) async {
      final path = request.url.path;
      if (path.endsWith('/api/v1/legal/current')) {
        return http.Response(
          effectiveTerms
              ? jsonEncode({
                  'status': 'effective',
                  'termsVersionId': 'test-terms',
                  'termsContentDigest': 'a' * 64,
                  'ageDeclarationVersion': 'age-16-v1',
                })
              : '{"status":"unavailable","termsVersionId":null,"termsContentDigest":null,"ageDeclarationVersion":null}',
          200,
        );
      }
      if (path.endsWith('/api/v1/legal/registration-intent')) {
        legalProofRequests++;
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        if (body['acceptedTermsAndDeclaredAge16'] != true ||
            body['termsVersionId'] != 'test-terms') {
          return http.Response('{}', 409);
        }
        return http.Response(
          jsonEncode({
            'termsVersionId': 'test-terms',
            'token': 'b' * 64,
            'binding': 'c' * 64,
            'expiresAt': '2026-10-02T01:00:00Z',
          }),
          200,
        );
      }
      if (path.endsWith('/sign-up/email')) {
        signupProofHeaders = [
          request.headers['x-dayli-registration-intent'],
          request.headers['x-dayli-registration-binding'],
        ];
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        // Better Auth's responses for a taken email and its attempt limit.
        return switch (body['email']) {
          'taken@example.test' => http.Response(
            '{"code":"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"}',
            422,
          ),
          'busy@example.test' => http.Response('{}', 429),
          _ => http.Response('{}', 200, headers: {'set-auth-token': 'token-1'}),
        };
      }
      if (path.endsWith('/sign-in/social')) {
        return http.Response(
          '{}',
          200,
          headers: {'set-auth-token': 'google-token'},
        );
      }
      if (path.endsWith('/sign-in/email')) {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        if (body['email'] == 'busy@example.test') {
          return http.Response('{}', 429);
        }
        return body['password'] == 'correct-password'
            ? http.Response('{}', 200, headers: {'set-auth-token': 'token-1'})
            : http.Response('{}', 401);
      }
      if (path.endsWith('/get-session')) {
        if (request.headers['authorization'] == 'Bearer google-token') {
          return http.Response(
            jsonEncode({
              'user': {
                'id': 'google-user',
                'name': 'Provider Name',
                'email': 'google@example.test',
                'username': null,
              },
              'session': {'id': 'google-session'},
            }),
            200,
          );
        }
        return request.headers['authorization'] == 'Bearer token-1'
            ? http.Response(
                jsonEncode({
                  'user': {
                    'id': testUserId,
                    'name': 'Jos',
                    'email': 'jos@example.test',
                    'username': sessionUsername,
                  },
                  'session': {'id': 's1'},
                }),
                200,
              )
            : http.Response('null', 200);
      }
      if (path.endsWith('/api/v1/profile/username')) {
        return http.Response('{}', 200);
      }
      if (path.endsWith('/sign-out')) return http.Response('{}', 200);
      if (path.endsWith('/api/v1/profile/username') &&
          request.method == 'POST' &&
          request.headers['authorization'] == 'Bearer token-1') {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        sessionUsername = body['username'] as String;
        return http.Response('{}', 200);
      }
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
      clearUserMedia: mediaCompressor.discardAll,
    );
  }

  String testUserId = 'user-1';

  /// Null makes the signed-in account finish username setup first.
  String? sessionUsername = 'jos';
  final tokens = MemoryTokenStore();
  final users = MemoryUserCache();
  final drafts = MemoryDraftStore();
  final streakCache = MemoryStreakCache();
  final postActivity = PostActivity();
  final FakePostingDayClient postingDays;
  final FakeFeedClient feed;
  final FakePostClient posts;
  final FakeProfileClient profiles;
  final FakeInteractionsClient interactions;
  final FriendsClient friends;
  final FakeSubmitter submitter;
  final mediaPicker = FakeMediaPicker();
  final pendingStore = MemoryPendingCaptureStore();

  /// The voice memo recorder, its microphone permission, and its files.
  final voiceRecorder = FakeVoiceRecorder();
  final microphone = FakeMicrophonePermission(
    current: PermissionStatus.granted,
  );
  final voiceFiles = FakeVoiceMemoFiles();

  /// Files the app removed because no one could claim them.
  final deletedFiles = <String>[];
  late final pendingCaptures = PendingCaptures(
    store: pendingStore,
    deleteFile: (path) async => deletedFiles.add(path),
    clock: () => DateTime.utc(2026, 9, 25, 3),
  );
  final mediaCompressor = FakeMediaCompressor();
  final mediaUploads = FakeMediaUploadClient();

  /// False gives the app no upload client, so picked media stays on the device.
  final bool uploadMedia;
  final bool effectiveTerms;
  final AccountExportClient? accountExports;
  final GoogleIdTokenProvider? google;
  int legalProofRequests = 0;
  List<String?>? signupProofHeaders;
  late final SessionController session;

  AppServices get services => AppServices(
    session: session,
    accountExports: accountExports,
    postingDays: postingDays,
    feed: feed,
    posts: posts,
    friends: friends,
    profiles: profiles,
    interactions: interactions,
    drafts: drafts,
    submitter: submitter,
    mediaPicker: mediaPicker,
    pendingCaptures: pendingCaptures,
    voiceMemos: VoiceMemoServices(
      createRecorder: () => voiceRecorder,
      permission: microphone,
      files: voiceFiles,
      // Widget tests move fake time, not the wall clock.
      clock: () => TestWidgetsFlutterBinding.ensureInitialized().clock.now(),
    ),
    mediaCompressor: mediaCompressor,
    mediaUploads: uploadMedia ? mediaUploads : null,
    streakCache: streakCache,
    postActivity: postActivity,
    google: google,
    clock: () => DateTime.utc(2026, 9, 25, 3),
  );
}

/// Records what the app asks the player to do. With [failures] queued, the
/// next players fail to load instead of initialising.
class FakeVideoPlatform extends VideoPlayerPlatform {
  final sources = <String?>[];
  final calls = <String>[];
  var failures = 0;

  /// How long every new player reports its media to be.
  var mediaDuration = const Duration(seconds: 10);

  /// What [getPosition] answers, which the player polls while playing.
  var position = Duration.zero;
  final seeks = <Duration>[];
  var _nextId = 0;
  final _events = <int, StreamController<VideoEvent>>{};

  @override
  Future<void> init() async {}

  @override
  Future<int?> createWithOptions(VideoCreationOptions options) async {
    final id = _nextId++;
    sources.add(options.dataSource.uri);
    final events = StreamController<VideoEvent>();
    _events[id] = events;
    if (failures > 0) {
      failures--;
      // Real platforms report a failed load, such as a 403, this way.
      events.addError(PlatformException(code: 'VideoError', message: '403'));
    } else {
      events.add(
        VideoEvent(
          eventType: VideoEventType.initialized,
          duration: mediaDuration,
          size: const Size(1080, 1920),
        ),
      );
    }
    return id;
  }

  @override
  Stream<VideoEvent> videoEventsFor(int playerId) => _events[playerId]!.stream;

  @override
  Future<void> setLooping(int playerId, bool looping) async =>
      calls.add('loop:$looping');

  @override
  Future<void> setVolume(int playerId, double volume) async =>
      calls.add('volume:$volume');

  @override
  Future<void> play(int playerId) async => calls.add('play');

  @override
  Future<void> pause(int playerId) async => calls.add('pause');

  @override
  Future<void> setPlaybackSpeed(int playerId, double speed) async {}

  @override
  Future<void> seekTo(int playerId, Duration position) async {
    seeks.add(position);
    this.position = position;
  }

  @override
  Future<Duration> getPosition(int playerId) async => position;

  /// Tells the player the media played to its end.
  void finish(int playerId) =>
      _events[playerId]?.add(VideoEvent(eventType: VideoEventType.completed));

  @override
  Future<void> setMixWithOthers(bool mixWithOthers) async {}

  @override
  Widget buildViewWithOptions(VideoViewOptions options) =>
      const SizedBox.expand();

  @override
  Future<void> dispose(int playerId) async {
    unawaited(_events.remove(playerId)?.close());
  }
}

/// A signed attachment for widget tests.
PostMedia attachment(
  String id,
  int order, {
  String contentType = 'image/jpeg',
}) => PostMedia(
  id: id,
  contentType: contentType,
  order: order,
  url: Uri.parse('https://storage.example.test/$id?sig=1'),
  expiresAt: DateTime.utc(2026, 9, 26, 3, 5),
);

/// Profiles by handle. An unknown handle gets a plain public profile, and
/// `jos` (the signed-in test user) is the owner's own.
class FakeProfileClient implements ProfileClient {
  FakeProfileClient([Map<String, ProfileDetails>? profiles])
    : profiles = profiles ?? {};

  final Map<String, ProfileDetails> profiles;
  final requested = <String>[];
  final updates = <({String? bio, String? publicName, bool? isPrivate})>[];
  final aboutUpdates =
      <({String? mbti, String? whatIDo, String? listeningTo})>[];
  final usernameChanges = <String>[];
  ApiResult<String>? changeResult;

  ProfileDetails _profile(String username) =>
      profiles[username] ??
      ProfileDetails(
        id: 'user-$username',
        username: username,
        displayName: username,
        detailsVisible: true,
        bio: null,
        isOwner: username == 'jos',
      );

  /// When set, profile reads fail with it, as when the device is offline.
  ApiFailure? detailsFailure;

  @override
  Future<ApiResult<ProfileDetails>> details(String username) async {
    requested.add(username);
    if (detailsFailure case final failure?) return ApiError(failure);
    return ApiSuccess(_profile(username));
  }

  @override
  Future<ApiResult<ProfileDetails>> update({
    String? bio,
    String? publicName,
    bool? isPrivate,
    String? mbti,
    String? whatIDo,
    String? listeningTo,
  }) async {
    updates.add((bio: bio, publicName: publicName, isPrivate: isPrivate));
    aboutUpdates.add((mbti: mbti, whatIDo: whatIDo, listeningTo: listeningTo));
    final current = _profile('jos');
    final updated = ProfileDetails(
      id: current.id,
      username: current.username,
      displayName: publicName == null
          ? current.displayName
          : publicName.isEmpty
          ? current.username
          : publicName,
      detailsVisible: true,
      bio: bio == null ? current.bio : (bio.isEmpty ? null : bio),
      isOwner: true,
      mbti: mbti == null ? current.mbti : (mbti.isEmpty ? null : mbti),
      whatIDo: whatIDo == null
          ? current.whatIDo
          : (whatIDo.isEmpty ? null : whatIDo),
      listeningTo: listeningTo == null
          ? current.listeningTo
          : (listeningTo.isEmpty ? null : listeningTo),
      isPrivate: isPrivate ?? current.isPrivate,
      usernameChangeAvailableAt: current.usernameChangeAvailableAt,
    );
    profiles[current.username] = updated;
    return ApiSuccess(updated);
  }

  @override
  Future<ApiResult<String>> changeUsername(String username) async {
    usernameChanges.add(username);
    return changeResult ?? ApiSuccess(username);
  }

  /// What [moodHistory] returns; unavailable unless a test sets it.
  ApiResult<MoodHistory> moodResult = const ApiError(ServiceUnavailable());
  final moodRequests = <(String, MoodRange)>[];

  @override
  Future<ApiResult<MoodHistory>> moodHistory(
    String username,
    MoodRange range,
  ) async {
    moodRequests.add((username, range));
    return moodResult;
  }
}

PostComment postComment(
  String id, {
  String text = 'Beautiful.',
  String? parentCommentId,
  String author = 'ben',
  bool viewerCanEdit = false,
  bool viewerCanDelete = false,
  DateTime? editedAt,
}) => PostComment(
  id: id,
  postId: '1',
  parentCommentId: parentCommentId,
  author: InteractionPerson(
    id: 'user-$author',
    username: author,
    displayName: author[0].toUpperCase() + author.substring(1),
  ),
  text: text,
  createdAt: DateTime.utc(2026, 9, 29, 20),
  editedAt: editedAt,
  viewerCanEdit: viewerCanEdit,
  viewerCanDelete: viewerCanDelete,
);

class FakeInteractionsClient implements InteractionsClient {
  /// Like results in order; the last repeats. Null echoes the request.
  final likeResults = <ApiResult<LikeSummary>>[];
  final likeRequests = <bool>[];

  /// Completes each like when set, so a test can see the optimistic state.
  Completer<void>? holdLike;

  @override
  Future<ApiResult<LikeSummary>> setLike(
    String postId, {
    required bool liked,
  }) async {
    likeRequests.add(liked);
    await holdLike?.future;
    if (likeResults.isEmpty) {
      return ApiSuccess(
        LikeSummary(likeCount: liked ? 1 : 0, viewerHasLiked: liked),
      );
    }
    return likeResults.length > 1
        ? likeResults.removeAt(0)
        : likeResults.single;
  }

  ApiResult<PostPage<PostLike>> likesResult = const ApiSuccess(
    PostPage(items: [], nextCursor: null, hasMore: false),
  );

  @override
  Future<ApiResult<PostPage<PostLike>>> likes(
    String postId, {
    String? cursor,
  }) async => likesResult;

  /// Comment pages in order; the last repeats.
  final commentResults = <ApiResult<PostPage<PostComment>>>[
    const ApiSuccess(PostPage(items: [], nextCursor: null, hasMore: false)),
  ];
  final commentRequests = <String?>[];

  @override
  Future<ApiResult<PostPage<PostComment>>> comments(
    String postId, {
    String? cursor,
  }) async {
    commentRequests.add(cursor);
    return commentResults.length > 1
        ? commentResults.removeAt(0)
        : commentResults.single;
  }

  /// Create results in order; the last repeats.
  final createResults = <ApiResult<PostComment>>[];
  final created =
      <({String clientCommentId, String text, String? parentCommentId})>[];

  @override
  Future<ApiResult<PostComment>> createComment(
    String postId, {
    required String clientCommentId,
    required String text,
    String? parentCommentId,
  }) async {
    created.add((
      clientCommentId: clientCommentId,
      text: text,
      parentCommentId: parentCommentId,
    ));
    return createResults.length > 1
        ? createResults.removeAt(0)
        : createResults.single;
  }

  ApiResult<PostComment>? updateResult;
  final updates = <(String, String)>[];

  @override
  Future<ApiResult<PostComment>> updateComment(
    String postId,
    String commentId,
    String text,
  ) async {
    updates.add((commentId, text));
    return updateResult ?? const ApiError(ServiceUnavailable());
  }

  ApiResult<void> deleteResult = const ApiSuccess(null);
  final deletedComments = <String>[];

  @override
  Future<ApiResult<void>> deleteComment(String postId, String commentId) async {
    deletedComments.add(commentId);
    return deleteResult;
  }
}

import 'dart:convert';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;
import 'package:http/http.dart' as http;

import 'api_failure.dart';
import 'feed_client.dart' show FeedPost;
import 'post_media.dart';
import 'post_page.dart';
import 'posting_day_client.dart' show failureForStatus;
import '../weather/post_weather.dart';

/// One post the signed-in user may read.
class PostDetail {
  const PostDetail({
    required this.id,
    required this.authorId,
    required this.username,
    required this.displayName,
    required this.localDate,
    required this.promptText,
    required this.reflectiveAnswer,
    required this.caption,
    required this.rating,
    required this.audience,
    required this.acceptedAt,
    required this.edited,
    required this.viewerIsAuthor,
    this.revisionCount = 0,
    this.likeCount = 0,
    this.viewerHasLiked = false,
    this.commentCount = 0,
    this.media = const [],
    this.voiceMemo,
    this.weather,
  });

  final String id;
  final String authorId;
  final String username;
  final String displayName;

  /// The Auckland day the post was written for, as `YYYY-MM-DD`.
  final String localDate;

  /// The prompt stored with the post, not the current day's prompt.
  final String promptText;
  final String reflectiveAnswer;
  final String? caption;
  final int rating;

  /// `solo` or `friends`.
  final String audience;
  final DateTime acceptedAt;
  final bool edited;
  final bool viewerIsAuthor;

  /// Earlier versions this user can read. The author sends it back when
  /// editing, so an edit saved elsewhere in between is a conflict.
  final int revisionCount;

  final int likeCount;
  final bool viewerHasLiked;

  /// Comments and replies this user can see.
  final int commentCount;

  /// Attached photos or video in display order.
  final List<PostMedia> media;

  /// The post's voice memo, or null. Only post detail carries it: feeds and
  /// profile lists do not, so their cards never play audio.
  final PostVoiceMemo? voiceMemo;

  /// The weather the author added, or null. Only post detail carries it: feeds
  /// and profile lists do not. It is the author's own snapshot, not verified.
  final PostWeather? weather;

  /// This post with new interaction counts.
  PostDetail copyWith({
    int? likeCount,
    bool? viewerHasLiked,
    int? commentCount,
  }) => PostDetail(
    id: id,
    authorId: authorId,
    username: username,
    displayName: displayName,
    localDate: localDate,
    promptText: promptText,
    reflectiveAnswer: reflectiveAnswer,
    caption: caption,
    rating: rating,
    audience: audience,
    acceptedAt: acceptedAt,
    edited: edited,
    viewerIsAuthor: viewerIsAuthor,
    revisionCount: revisionCount,
    likeCount: likeCount ?? this.likeCount,
    viewerHasLiked: viewerHasLiked ?? this.viewerHasLiked,
    commentCount: commentCount ?? this.commentCount,
    media: media,
    voiceMemo: voiceMemo,
    weather: weather,
  );

  static PostDetail? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final author = json['author'];
    final prompt = json['prompt'];
    final acceptedAt = DateTime.tryParse('${json['acceptedAt']}');
    if (author is! Map<String, Object?> ||
        prompt is! Map<String, Object?> ||
        acceptedAt == null) {
      return null;
    }
    final id = json['id'];
    final authorId = author['id'];
    final username = author['username'];
    final displayName = author['displayName'];
    final localDate = json['localDate'];
    final promptText = prompt['text'];
    final answer = json['reflectiveAnswer'];
    final caption = json['caption'];
    final rating = json['rating'];
    final audience = json['audience'];
    if (id is! String ||
        authorId is! String ||
        username is! String ||
        displayName is! String ||
        localDate is! String ||
        promptText is! String ||
        answer is! String ||
        (caption != null && caption is! String) ||
        rating is! int ||
        (audience != 'solo' && audience != 'friends')) {
      return null;
    }
    return PostDetail(
      id: id,
      authorId: authorId,
      username: username,
      displayName: displayName,
      localDate: localDate,
      promptText: promptText,
      reflectiveAnswer: answer,
      caption: caption as String?,
      rating: rating,
      audience: audience! as String,
      acceptedAt: acceptedAt,
      edited: json['edited'] == true,
      viewerIsAuthor: json['viewerIsAuthor'] == true,
      revisionCount: _count(json['revisionCount']),
      likeCount: _count(json['likeCount']),
      viewerHasLiked: json['viewerHasLiked'] == true,
      commentCount: _count(json['commentCount']),
      media: PostMedia.parseList(json['media']),
      voiceMemo: PostVoiceMemo.tryParse(json['voiceMemo']),
      // A snapshot that fails the same limits the API enforces is treated as
      // absent, so odd data from a server never reaches the screen.
      weather: PostWeather.tryParse(json['weather']),
    );
  }
}

int _count(Object? value) => value is int && value >= 0 ? value : 0;

/// The author's change to a post. Every field is sent, so the server only
/// saves the ones that differ.
class PostEdit {
  const PostEdit({
    required this.expectedRevisionCount,
    required this.reflectiveAnswer,
    required this.caption,
    required this.rating,
    required this.audience,
  });

  final int expectedRevisionCount;
  final String reflectiveAnswer;

  /// Null removes the caption.
  final String? caption;
  final int rating;

  /// `solo` or `friends`.
  final String audience;
}

/// An earlier version of a post, which an edit replaced at [replacedAt].
class PostRevision {
  const PostRevision({
    required this.revisionNumber,
    required this.reflectiveAnswer,
    required this.caption,
    required this.rating,
    required this.audience,
    required this.replacedAt,
  });

  final int revisionNumber;
  final String reflectiveAnswer;
  final String? caption;
  final int rating;

  /// `solo` or `friends`.
  final String audience;
  final DateTime replacedAt;

  static PostRevision? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final number = json['revisionNumber'];
    final answer = json['reflectiveAnswer'];
    final caption = json['caption'];
    final rating = json['rating'];
    final audience = json['audience'];
    final replacedAt = DateTime.tryParse('${json['replacedAt']}');
    if (number is! int ||
        answer is! String ||
        (caption != null && caption is! String) ||
        rating is! int ||
        (audience != 'solo' && audience != 'friends') ||
        replacedAt == null) {
      return null;
    }
    return PostRevision(
      revisionNumber: number,
      reflectiveAnswer: answer,
      caption: caption as String?,
      rating: rating,
      audience: audience! as String,
      replacedAt: replacedAt,
    );
  }
}

/// A post on a profile. Only the author sees their solo and unreleased posts.
class ProfilePost extends FeedPost {
  const ProfilePost({
    required super.id,
    required super.authorId,
    required super.username,
    required super.displayName,
    required super.localDate,
    required super.promptText,
    required super.reflectiveAnswer,
    required super.caption,
    required super.rating,
    required super.acceptedAt,
    required super.edited,
    super.likeCount,
    super.viewerHasLiked,
    super.commentCount,
    super.media,
    required this.audience,
    required this.released,
  });

  /// `solo` or `friends`.
  final String audience;

  /// False only on your own profile, before the post's day is released.
  final bool released;

  static ProfilePost? tryParse(Object? json) {
    final post = FeedPost.tryParse(json);
    if (post == null || json is! Map<String, Object?>) return null;
    final audience = json['audience'];
    final released = json['released'];
    if ((audience != 'solo' && audience != 'friends') || released is! bool) {
      return null;
    }
    return ProfilePost(
      id: post.id,
      authorId: post.authorId,
      username: post.username,
      displayName: post.displayName,
      localDate: post.localDate,
      promptText: post.promptText,
      reflectiveAnswer: post.reflectiveAnswer,
      caption: post.caption,
      rating: post.rating,
      acceptedAt: post.acceptedAt,
      edited: post.edited,
      likeCount: post.likeCount,
      viewerHasLiked: post.viewerHasLiked,
      commentCount: post.commentCount,
      media: post.media,
      audience: audience! as String,
      released: released,
    );
  }
}

typedef ProfilePostsPage = PostPage<ProfilePost>;

class TrashedPost {
  const TrashedPost({
    required this.id,
    required this.localDate,
    required this.restoreUntil,
    required this.purgeDueAt,
    required this.generation,
    required this.pendingCleanup,
  });

  final String id;
  final String localDate;
  final DateTime restoreUntil;
  final DateTime purgeDueAt;
  final int generation;
  final bool pendingCleanup;

  static TrashedPost? tryParse(Object? value) {
    if (value is! Map<String, Object?>) return null;
    final id = value['id'];
    final localDate = value['localDate'];
    final restoreUntil = DateTime.tryParse(
      value['restoreUntil']?.toString() ?? '',
    );
    final purgeDueAt = DateTime.tryParse(value['purgeDueAt']?.toString() ?? '');
    final generation = value['generation'];
    final pendingCleanup = value['pendingCleanup'];
    if (id is! String ||
        localDate is! String ||
        restoreUntil == null ||
        purgeDueAt == null ||
        generation is! int ||
        pendingCleanup is! bool) {
      return null;
    }
    return TrashedPost(
      id: id,
      localDate: localDate,
      restoreUntil: restoreUntil,
      purgeDueAt: purgeDueAt,
      generation: generation,
      pendingCleanup: pendingCleanup,
    );
  }
}

abstract interface class PostTrashClient {
  Future<ApiResult<List<TrashedPost>>> listTrash();
  Future<ApiResult<void>> restore(String postId);
}

class UnavailablePostTrashClient implements PostTrashClient {
  const UnavailablePostTrashClient();
  @override
  Future<ApiResult<List<TrashedPost>>> listTrash() async =>
      const ApiError(ServiceUnavailable());
  @override
  Future<ApiResult<void>> restore(String postId) async =>
      const ApiError(ServiceUnavailable());
}

abstract interface class PostClient {
  Future<ApiResult<PostDetail>> get(String postId);

  /// [NotFound] when the profile is unknown or blocked. A profile whose posts
  /// you may not read is an empty page.
  Future<ApiResult<ProfilePostsPage>> profilePage(
    String username, {
    String? cursor,
  });

  /// A fresh download URL for one attachment whose earlier URL expired.
  Future<ApiResult<PostMedia>> media(String postId, String mediaId);

  /// A fresh download URL for a post's voice memo whose earlier URL expired.
  /// [NotFound] when the post has none or may not be read.
  Future<ApiResult<PostVoiceMemo>> voiceMemo(String postId);

  /// Saves the author's edit and returns the post as it is now. [Conflict]
  /// means another edit was saved after [PostEdit.expectedRevisionCount].
  Future<ApiResult<PostDetail>> update(String postId, PostEdit edit);

  /// Deletes the author's post by moving it to Trash. Trashing it again also
  /// succeeds. [ServiceUnavailable] while Trash is switched off.
  Future<ApiResult<void>> delete(String postId);

  /// Earlier versions of a post, newest first.
  Future<ApiResult<PostPage<PostRevision>>> revisions(
    String postId, {
    String? cursor,
  });
}

/// Reads posts and profile posts with the stored Better Auth bearer session.
/// Bodies are decoded here because the generated models rejected a null
/// `caption` until the generator fix in #195.
class GeneratedPostClient implements PostClient, PostTrashClient {
  GeneratedPostClient({
    required String baseUrl,
    required this._bearerToken,
    this._httpClient,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');

  final String _baseUrl;
  final Future<String?> Function() _bearerToken;
  final http.Client? _httpClient;

  @override
  Future<ApiResult<PostDetail>> get(String postId) async {
    final token = await _bearerToken();
    final auth = token == null
        ? null
        : (generated.HttpBearerAuth()..accessToken = token);
    final client = generated.ApiClient(
      basePath: _baseUrl,
      authentication: auth,
    );
    if (_httpClient != null) client.client = _httpClient;

    final http.Response response;
    try {
      response = await generated.PostsApi(client).postsGetWithHttpInfo(postId);
    } on generated.ApiException catch (error) {
      return ApiError(failureForStatus(error.code, error.innerException));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }

    final status = response.statusCode;
    // A missing post and one this user may not read are both 404; an ID the
    // server rejects outright could never name a post either.
    if (status == HttpStatus.notFound ||
        status == HttpStatus.unprocessableEntity) {
      return const ApiError(NotFound());
    }
    if (status != HttpStatus.ok) {
      return ApiError(failureForStatus(status, null));
    }
    final Object? json;
    try {
      json = jsonDecode(response.body);
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    }
    final post = PostDetail.tryParse(json);
    return post == null
        ? const ApiError(ServiceUnavailable())
        : ApiSuccess(post);
  }

  @override
  Future<ApiResult<ProfilePostsPage>> profilePage(
    String username, {
    String? cursor,
  }) async {
    final token = await _bearerToken();
    final auth = token == null
        ? null
        : (generated.HttpBearerAuth()..accessToken = token);
    final client = generated.ApiClient(
      basePath: _baseUrl,
      authentication: auth,
    );
    if (_httpClient != null) client.client = _httpClient;

    final http.Response response;
    try {
      response = await generated.PostsApi(
        client,
      ).postsListProfilePostsWithHttpInfo(username, cursor: cursor);
    } on generated.ApiException catch (error) {
      return ApiError(failureForStatus(error.code, error.innerException));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }

    final status = response.statusCode;
    // Unknown and blocked profiles are both 404; a malformed handle could
    // never name one.
    if (status == HttpStatus.notFound ||
        (status == HttpStatus.unprocessableEntity && cursor == null)) {
      return const ApiError(NotFound());
    }
    if (status != HttpStatus.ok) {
      return ApiError(failureForStatus(status, null));
    }
    final Object? json;
    try {
      json = jsonDecode(response.body);
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    }
    final page = PostPage.tryParse(json, ProfilePost.tryParse);
    return page == null
        ? const ApiError(ServiceUnavailable())
        : ApiSuccess(page);
  }

  @override
  Future<ApiResult<PostMedia>> media(String postId, String mediaId) async {
    final token = await _bearerToken();
    final auth = token == null
        ? null
        : (generated.HttpBearerAuth()..accessToken = token);
    final client = generated.ApiClient(
      basePath: _baseUrl,
      authentication: auth,
    );
    if (_httpClient != null) client.client = _httpClient;

    final http.Response response;
    try {
      response = await generated.PostsApi(
        client,
      ).postsGetMediaWithHttpInfo(postId, mediaId);
    } on generated.ApiException catch (error) {
      return ApiError(failureForStatus(error.code, error.innerException));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }

    final status = response.statusCode;
    // Missing, detached, and unreadable media are all 404.
    if (status == HttpStatus.notFound ||
        status == HttpStatus.unprocessableEntity) {
      return const ApiError(NotFound());
    }
    if (status != HttpStatus.ok) {
      return ApiError(failureForStatus(status, null));
    }
    final Object? json;
    try {
      json = jsonDecode(response.body);
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    }
    final media = PostMedia.tryParse(json);
    return media == null || media.url == null
        ? const ApiError(ServiceUnavailable())
        : ApiSuccess(media);
  }

  @override
  Future<ApiResult<PostVoiceMemo>> voiceMemo(String postId) async {
    final token = await _bearerToken();
    if (token == null) return const ApiError(Unauthenticated());

    final auth = generated.HttpBearerAuth()..accessToken = token;
    final client = generated.ApiClient(
      basePath: _baseUrl,
      authentication: auth,
    );
    if (_httpClient != null) client.client = _httpClient;

    final http.Response response;
    try {
      response = await generated.PostsApi(
        client,
      ).postsGetVoiceMemoWithHttpInfo(postId);
    } on generated.ApiException catch (error) {
      return ApiError(failureForStatus(error.code, error.innerException));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }

    final status = response.statusCode;
    // A missing, detached, or unreadable voice memo is always 404.
    if (status == HttpStatus.notFound ||
        status == HttpStatus.unprocessableEntity) {
      return const ApiError(NotFound());
    }
    if (status != HttpStatus.ok) {
      return ApiError(failureForStatus(status, null));
    }
    final Object? json;
    try {
      json = jsonDecode(response.body);
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    }
    final memo = PostVoiceMemo.tryParse(json);
    return memo == null || memo.url == null
        ? const ApiError(ServiceUnavailable())
        : ApiSuccess(memo);
  }

  @override
  Future<ApiResult<PostDetail>> update(String postId, PostEdit edit) async {
    final sent = await _send(
      (api) => api.postsUpdateWithHttpInfo(
        postId,
        generated.UpdatePostRequest(
          expectedRevisionCount: edit.expectedRevisionCount,
          reflectiveAnswer: edit.reflectiveAnswer,
          caption: edit.caption,
          rating: edit.rating,
          audience: generated.PostAudience.fromJson(edit.audience)!,
        ),
      ),
    );
    if (sent case ApiError(:final failure)) return ApiError(failure);
    final response = (sent as ApiSuccess<http.Response>).value;
    return switch (response.statusCode) {
      HttpStatus.ok => _decode(response, PostDetail.tryParse),
      HttpStatus.notFound => const ApiError(NotFound()),
      HttpStatus.conflict => const ApiError(
        Conflict('This dayli was edited somewhere else since you opened it.'),
      ),
      final status => ApiError(failureForStatus(status, null)),
    };
  }

  @override
  Future<ApiResult<void>> delete(String postId) async {
    final sent = await _send((api) => api.postsTrashWithHttpInfo(postId));
    if (sent case ApiError(:final failure)) return ApiError(failure);
    final response = (sent as ApiSuccess<http.Response>).value;
    return switch (response.statusCode) {
      HttpStatus.ok => const ApiSuccess(null),
      HttpStatus.notFound ||
      HttpStatus.unprocessableEntity => const ApiError(NotFound()),
      HttpStatus.conflict => const ApiError(
        Conflict("This dayli can't be deleted right now."),
      ),
      final status => ApiError(failureForStatus(status, null)),
    };
  }

  @override
  Future<ApiResult<List<TrashedPost>>> listTrash() async {
    final sent = await _send((api) => api.postsListTrashWithHttpInfo());
    if (sent case ApiError(:final failure)) return ApiError(failure);
    final response = (sent as ApiSuccess<http.Response>).value;
    if (response.statusCode != HttpStatus.ok) {
      return ApiError(failureForStatus(response.statusCode, null));
    }
    try {
      final json = jsonDecode(response.body);
      final values = json is Map<String, Object?> ? json['posts'] : null;
      if (values is! List) return const ApiError(ServiceUnavailable());
      final posts = values.map(TrashedPost.tryParse).toList();
      return posts.any((post) => post == null)
          ? const ApiError(ServiceUnavailable())
          : ApiSuccess(posts.cast<TrashedPost>());
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    }
  }

  @override
  Future<ApiResult<void>> restore(String postId) async {
    final sent = await _send((api) => api.postsRestoreWithHttpInfo(postId));
    if (sent case ApiError(:final failure)) return ApiError(failure);
    final response = (sent as ApiSuccess<http.Response>).value;
    return switch (response.statusCode) {
      HttpStatus.ok => const ApiSuccess(null),
      HttpStatus.notFound => const ApiError(NotFound()),
      HttpStatus.conflict => const ApiError(
        Conflict(
          'This day already has a replacement, so the original cannot be restored.',
        ),
      ),
      final status => ApiError(failureForStatus(status, null)),
    };
  }

  @override
  Future<ApiResult<PostPage<PostRevision>>> revisions(
    String postId, {
    String? cursor,
  }) async {
    final sent = await _send(
      (api) => api.postsListRevisionsWithHttpInfo(postId, cursor: cursor),
    );
    if (sent case ApiError(:final failure)) return ApiError(failure);
    final response = (sent as ApiSuccess<http.Response>).value;
    return switch (response.statusCode) {
      HttpStatus.ok => _decode(
        response,
        (json) => PostPage.tryParse(json, PostRevision.tryParse),
      ),
      HttpStatus.notFound => const ApiError(NotFound()),
      HttpStatus.unprocessableEntity when cursor == null => const ApiError(
        NotFound(),
      ),
      final status => ApiError(failureForStatus(status, null)),
    };
  }

  /// Sends one request with the stored bearer session.
  Future<ApiResult<http.Response>> _send(
    Future<http.Response> Function(generated.PostsApi api) request,
  ) async {
    final token = await _bearerToken();
    if (token == null) return const ApiError(Unauthenticated());

    final auth = generated.HttpBearerAuth()..accessToken = token;
    final client = generated.ApiClient(
      basePath: _baseUrl,
      authentication: auth,
    );
    if (_httpClient != null) client.client = _httpClient;
    try {
      return ApiSuccess(await request(generated.PostsApi(client)));
    } on generated.ApiException catch (error) {
      return ApiError(failureForStatus(error.code, error.innerException));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }
  }

  static ApiResult<T> _decode<T>(
    http.Response response,
    T? Function(Object? json) parse,
  ) {
    final Object? json;
    try {
      json = jsonDecode(response.body);
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    }
    final value = parse(json);
    return value == null
        ? const ApiError(ServiceUnavailable())
        : ApiSuccess(value);
  }
}

import 'dart:convert';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;
import 'package:http/http.dart' as http;

import 'api_failure.dart';
import 'feed_client.dart' show FeedPost;
import 'post_media.dart';
import 'post_page.dart';
import 'posting_day_client.dart' show failureForStatus;

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
    this.media = const [],
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

  /// Attached photos or video in display order.
  final List<PostMedia> media;

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
      media: PostMedia.parseList(json['media']),
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
      media: post.media,
      audience: audience! as String,
      released: released,
    );
  }
}

typedef ProfilePostsPage = PostPage<ProfilePost>;

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
}

/// Reads posts and profile posts with the stored Better Auth bearer session.
/// Bodies are decoded here because the generated models treat the nullable
/// `caption` as required.
class GeneratedPostClient implements PostClient {
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
    if (token == null) return const ApiError(Unauthenticated());

    final auth = generated.HttpBearerAuth()..accessToken = token;
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
}

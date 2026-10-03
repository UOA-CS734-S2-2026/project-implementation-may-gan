import 'dart:convert';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;
import 'package:http/http.dart' as http;

import 'api_failure.dart';
import 'post_media.dart';
import 'post_page.dart';
import 'posting_day_client.dart' show failureForStatus;

/// A released post from an active friend.
class FeedPost {
  const FeedPost({
    required this.id,
    required this.authorId,
    required this.username,
    required this.displayName,
    required this.localDate,
    required this.promptText,
    required this.reflectiveAnswer,
    required this.caption,
    required this.rating,
    required this.acceptedAt,
    required this.edited,
    this.media = const [],
  });

  final String id;
  final String authorId;
  final String username;
  final String displayName;

  /// The Auckland day the post was written for, as `YYYY-MM-DD`.
  final String localDate;
  final String promptText;
  final String reflectiveAnswer;
  final String? caption;
  final int rating;
  final DateTime acceptedAt;
  final bool edited;

  /// Attached photos or video in display order.
  final List<PostMedia> media;

  /// Returns null for a malformed item rather than failing the whole page.
  static FeedPost? tryParse(Object? json) {
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
    if (id is! String ||
        authorId is! String ||
        username is! String ||
        displayName is! String ||
        localDate is! String ||
        promptText is! String ||
        answer is! String ||
        (caption != null && caption is! String) ||
        rating is! int) {
      return null;
    }
    return FeedPost(
      id: id,
      authorId: authorId,
      username: username,
      displayName: displayName,
      localDate: localDate,
      promptText: promptText,
      reflectiveAnswer: answer,
      caption: caption as String?,
      rating: rating,
      acceptedAt: acceptedAt,
      edited: json['edited'] == true,
      media: PostMedia.parseList(json['media']),
    );
  }
}

typedef FeedPage = PostPage<FeedPost>;

abstract interface class FeedClient {
  Future<ApiResult<FeedPage>> page({String? cursor});
}

/// Reads `GET /api/v1/feed` with the stored Better Auth bearer session.
///
/// The body is decoded here rather than through `FeedPost.fromJson`, which
/// rejected a null `caption` until the generator fix in #195.
class GeneratedFeedClient implements FeedClient {
  GeneratedFeedClient({
    required String baseUrl,
    required this._bearerToken,
    this._httpClient,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');

  final String _baseUrl;
  final Future<String?> Function() _bearerToken;
  final http.Client? _httpClient;

  @override
  Future<ApiResult<FeedPage>> page({String? cursor}) async {
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
      ).postsListFeedWithHttpInfo(cursor: cursor);
    } on generated.ApiException catch (error) {
      return ApiError(failureForStatus(error.code, error.innerException));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }

    // A cursor from before the most recent midnight; the feed has moved on.
    if (response.statusCode == HttpStatus.conflict && cursor != null) {
      return const ApiError(Expired());
    }
    if (response.statusCode != HttpStatus.ok) {
      return ApiError(failureForStatus(response.statusCode, null));
    }
    final Object? json;
    try {
      json = jsonDecode(response.body);
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    }
    final page = PostPage.tryParse(json, FeedPost.tryParse);
    return page == null
        ? const ApiError(ServiceUnavailable())
        : ApiSuccess(page);
  }
}

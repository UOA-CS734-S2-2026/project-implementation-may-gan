import 'dart:convert';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;
import 'package:http/http.dart' as http;

import 'api_failure.dart';
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
    );
  }
}

abstract interface class PostClient {
  Future<ApiResult<PostDetail>> get(String postId);
}

/// Reads `GET /api/v1/posts/{postId}` with the stored Better Auth bearer
/// session. The body is decoded here because the generated `PostDetail`
/// treats the nullable `caption` as required.
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
}

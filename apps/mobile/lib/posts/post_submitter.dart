import 'dart:convert';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;
import 'package:http/http.dart' as http;

import '../api/api_failure.dart';
import '../api/posting_day_client.dart';
import '../drafts/daily_post_draft.dart';
import '../weather/post_weather.dart';

/// Why the server refused to accept a draft.
enum SubmissionConflict {
  /// The draft's Auckland day ended before the server accepted it.
  postingDayClosed('POSTING_DAY_CLOSED'),

  /// The draft is dated after the server's current day.
  postingDayNotOpen('POSTING_DAY_NOT_OPEN'),

  /// The prompt no longer matches the day's prompt.
  promptChanged('PROMPT_CHANGED'),

  /// The author already has a post for the day.
  alreadyPosted('ALREADY_POSTED'),

  /// The idempotency key was already used for a different submission.
  idempotencyKeyReused('IDEMPOTENCY_KEY_REUSED'),

  /// This submission was posted, and the author has since moved it to Trash.
  postTrashed('POST_TRASHED'),

  /// An attachment is still uploading on the server's side.
  mediaNotReady('MEDIA_NOT_READY'),

  /// An attachment's upload can't be used any more and must be redone.
  mediaUnavailable('MEDIA_UNAVAILABLE');

  const SubmissionConflict(this.reason);

  /// The API's `details.reason` value.
  final String reason;

  static SubmissionConflict? fromReason(Object? reason) {
    for (final conflict in values) {
      if (conflict.reason == reason) return conflict;
    }
    return null;
  }
}

sealed class SubmissionResult {
  const SubmissionResult();
}

class SubmissionAccepted extends SubmissionResult {
  const SubmissionAccepted({required this.postId, required this.replayed});

  final String postId;

  /// True when the server replayed an earlier accepted attempt.
  final bool replayed;
}

class SubmissionRejected extends SubmissionResult {
  const SubmissionRejected(this.conflict);

  final SubmissionConflict conflict;
}

class SubmissionFailed extends SubmissionResult {
  const SubmissionFailed(this.failure);

  final ApiFailure failure;
}

/// Submits a draft with its idempotency key. Retrying the same draft must
/// reuse the key so a lost response cannot create a second post.
abstract interface class DailyPostSubmitter {
  Future<SubmissionResult> submit(DailyPostDraft draft);
}

/// Submits through the generated Dart client with the stored Better Auth
/// bearer session. Validated uploads are sent as reservation IDs.
class GeneratedPostSubmitter implements DailyPostSubmitter {
  GeneratedPostSubmitter({
    required String baseUrl,
    required this._bearerToken,
    this._httpClient,
    this.onForbidden,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');

  final String _baseUrl;
  final Future<String?> Function() _bearerToken;
  final http.Client? _httpClient;
  final void Function()? onForbidden;

  @override
  Future<SubmissionResult> submit(DailyPostDraft draft) async {
    final audience = draft.audience;
    // The composer validates first; this guards against a caller that didn't.
    if (audience == null) {
      return const SubmissionFailed(
        InvalidRequest('Choose who can see this dayli.'),
      );
    }
    final token = await _bearerToken();
    if (token == null) return const SubmissionFailed(Unauthenticated());

    final auth = generated.HttpBearerAuth()..accessToken = token;
    final client = generated.ApiClient(
      basePath: _baseUrl,
      authentication: auth,
    );
    if (_httpClient != null) client.client = _httpClient;
    final api = generated.PostsApi(client);

    final http.Response response;
    try {
      response = await api.postsCreateWithHttpInfo(
        draft.idempotencyKey,
        createRequestFor(draft, audience),
      );
    } on generated.ApiException catch (error) {
      return SubmissionFailed(
        failureForStatus(
          error.code,
          error.innerException,
          onForbidden: onForbidden,
        ),
      );
    } on IOException {
      return const SubmissionFailed(NetworkUnavailable());
    }

    final status = response.statusCode;
    if (status == HttpStatus.created) {
      final post = _decode(response.body);
      final postId = post?['id'];
      if (postId is! String) {
        return const SubmissionFailed(ServiceUnavailable());
      }
      return SubmissionAccepted(
        postId: postId,
        replayed: response.headers['idempotent-replayed'] == 'true',
      );
    }
    if (status == HttpStatus.conflict) {
      final conflict = SubmissionConflict.fromReason(
        _errorReason(response.body),
      );
      if (conflict != null) return SubmissionRejected(conflict);
      return const SubmissionFailed(ServiceUnavailable());
    }
    if (status == HttpStatus.unprocessableEntity &&
        _errorReason(response.body) == 'MEDIA_NOT_ALLOWED') {
      return const SubmissionFailed(
        InvalidRequest(
          'A dayli can have up to 3 photos or 1 video, up to 25 MB in total.',
        ),
      );
    }
    return SubmissionFailed(
      failureForStatus(status, null, onForbidden: onForbidden),
    );
  }

  static Object? _errorReason(String body) {
    final error = _decode(body)?['error'];
    final details = error is Map<String, Object?> ? error['details'] : null;
    return details is Map<String, Object?> ? details['reason'] : null;
  }

  static Map<String, Object?>? _decode(String body) {
    try {
      final json = jsonDecode(body);
      return json is Map<String, Object?> ? json : null;
    } on FormatException {
      return null;
    }
  }
}

/// Builds the create-post body from a draft. Text is trimmed to match the
/// server's normalisation, and blank optional fields are omitted. Only
/// validated uploads are attached; the composer won't post while any other
/// attachment is still uploading, so in practice that is all of them.
generated.CreateDailyPostRequest createRequestFor(
  DailyPostDraft draft,
  PostAudience audience,
) {
  String? optional(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  return _CreateDailyPostRequest(
    localDate: draft.localDate,
    promptId: draft.promptId,
    reflectiveAnswer: draft.reflectiveAnswer.trim(),
    caption: optional(draft.caption),
    rating: draft.rating!,
    audience: switch (audience) {
      PostAudience.friends => generated.PostAudience.friends,
      PostAudience.solo => generated.PostAudience.solo,
    },
    tomorrowNote: optional(draft.tomorrowNote),
    attachments: [
      for (final attachment in draft.attachments)
        if (attachment.status == AttachmentUploadStatus.validated)
          if (attachment.reservationId case final id?) id,
    ],
    weather: switch (draft.weather) {
      final weather? => _generatedWeather(weather),
      null => null,
    },
  );
}

generated.PostWeather _generatedWeather(PostWeather weather) =>
    generated.PostWeather(
      condition: switch (weather.condition) {
        WeatherCondition.clear => generated.PostWeatherCondition.clear,
        WeatherCondition.partlyCloudy =>
          generated.PostWeatherCondition.partlyCloudy,
        WeatherCondition.cloudy => generated.PostWeatherCondition.cloudy,
        WeatherCondition.fog => generated.PostWeatherCondition.fog,
        WeatherCondition.drizzle => generated.PostWeatherCondition.drizzle,
        WeatherCondition.rain => generated.PostWeatherCondition.rain,
        WeatherCondition.snow => generated.PostWeatherCondition.snow,
        WeatherCondition.thunderstorm =>
          generated.PostWeatherCondition.thunderstorm,
      },
      temperatureC: weather.temperatureC,
      placeName: weather.placeName,
    );

/// The generated model writes absent optional fields as `null`, and
/// `attachments` as an empty list, which the API's strict schema rejects
/// (an API without attachment support rejects the field outright). A `null`
/// `weather` is rejected too: the API accepts the snapshot or no field at all.
/// This omits all three, so a text-only post sends exactly what it always has.
class _CreateDailyPostRequest extends generated.CreateDailyPostRequest {
  _CreateDailyPostRequest({
    required super.localDate,
    required super.promptId,
    required super.reflectiveAnswer,
    super.caption,
    required super.rating,
    required super.audience,
    super.tomorrowNote,
    super.attachments,
    super.weather,
  });

  @override
  Map<String, dynamic> toJson() => super.toJson()
    ..removeWhere(
      (_, value) => value == null || value is List && value.isEmpty,
    );
}

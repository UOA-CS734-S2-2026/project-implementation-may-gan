import 'dart:convert';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;
import 'package:http/http.dart' as http;

import 'api_failure.dart';
import 'posting_day_client.dart' show failureForStatus;

/// Where and how to upload one reserved file. The URL is a short-lived
/// credential: keep it in memory only, and never log or save it.
class MediaUploadTicket {
  const MediaUploadTicket({
    required this.reservationId,
    required this.url,
    required this.requiredHeaders,
  });

  final String reservationId;
  final Uri url;

  /// Send exactly these on the PUT; R2 checks them against the signature.
  final Map<String, String> requiredHeaders;

  @override
  String toString() => 'MediaUploadTicket($reservationId)';
}

enum MediaCheckStatus { pending, validated, failed }

/// The server's verdict after `/complete`.
class MediaCheck {
  const MediaCheck(this.status, {this.failureReason});

  /// `pending` means the upload hasn't landed yet; ask again later.
  final MediaCheckStatus status;

  /// The server's reason when [status] is `failed`, such as
  /// `format_mismatch`.
  final String? failureReason;
}

/// Reserves, uploads, and completes one attachment. Media is sent straight to
/// storage, never through the API.
abstract interface class MediaUploadClient {
  /// Fails with [RateLimited] when the author has too many pending uploads.
  Future<ApiResult<MediaUploadTicket>> reserve({
    required String contentType,
    required int byteSize,
  });

  /// Uploads the file at [path]. Succeeds if storage already holds this
  /// upload. Fails with [Expired] when the URL no longer works, which means
  /// reserving again.
  Future<ApiResult<void>> upload(MediaUploadTicket ticket, String path);

  /// Fails with [Expired] when the reservation ran out before completion,
  /// and [NotFound] when it no longer exists.
  Future<ApiResult<MediaCheck>> complete(String reservationId);
}

class GeneratedMediaUploadClient implements MediaUploadClient {
  GeneratedMediaUploadClient({
    required String baseUrl,
    required this._bearerToken,
    this._httpClient,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');

  final String _baseUrl;
  final Future<String?> Function() _bearerToken;
  final http.Client? _httpClient;

  Future<generated.MediaApi?> _api() async {
    final token = await _bearerToken();
    if (token == null) return null;
    final auth = generated.HttpBearerAuth()..accessToken = token;
    final client = generated.ApiClient(
      basePath: _baseUrl,
      authentication: auth,
    );
    if (_httpClient != null) client.client = _httpClient;
    return generated.MediaApi(client);
  }

  @override
  Future<ApiResult<MediaUploadTicket>> reserve({
    required String contentType,
    required int byteSize,
  }) async {
    final type = generated.MediaContentType.fromJson(contentType);
    if (type == null || byteSize <= 0) {
      return const ApiError(InvalidRequest("This file can't be uploaded."));
    }
    final api = await _api();
    if (api == null) return const ApiError(Unauthenticated());

    final http.Response response;
    try {
      response = await api.mediaReservationsCreateWithHttpInfo(
        createMediaReservationRequest: generated.CreateMediaReservationRequest(
          contentType: type,
          byteSize: byteSize,
        ),
      );
    } on generated.ApiException catch (error) {
      return ApiError(failureForStatus(error.code, error.innerException));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }

    final status = response.statusCode;
    if (status == HttpStatus.tooManyRequests) {
      return const ApiError(RateLimited());
    }
    if (status != HttpStatus.created) {
      return ApiError(failureForStatus(status, null));
    }
    final ticket = _ticket(_decode(response.body));
    return ticket == null
        ? const ApiError(ServiceUnavailable())
        : ApiSuccess(ticket);
  }

  static MediaUploadTicket? _ticket(Map<String, Object?>? json) {
    final id = json?['id'];
    final upload = json?['upload'];
    if (id is! String || upload is! Map<String, Object?>) return null;
    final url = Uri.tryParse('${upload['url']}');
    final headers = upload['requiredHeaders'];
    if (url == null || !url.isScheme('https') || headers is! Map) return null;
    final required = <String, String>{};
    for (final MapEntry(:key, :value) in headers.entries) {
      if (key is! String || value is! String) return null;
      required[key.toLowerCase()] = value;
    }
    return MediaUploadTicket(
      reservationId: id,
      url: url,
      requiredHeaders: required,
    );
  }

  @override
  Future<ApiResult<void>> upload(MediaUploadTicket ticket, String path) async {
    final file = File(path);
    final int length;
    try {
      length = await file.length();
    } on FileSystemException {
      return const ApiError(
        InvalidRequest('This file is no longer available.'),
      );
    }
    // The signature covers the reserved size, so a changed file can't upload.
    if ('$length' != ticket.requiredHeaders['content-length']) {
      return const ApiError(InvalidRequest('This file changed. Add it again.'));
    }

    // A plain request with no API credentials: storage must never see the
    // session token, and the URL carries its own authorisation.
    final request = http.StreamedRequest('PUT', ticket.url)
      ..contentLength = length;
    ticket.requiredHeaders.forEach((name, value) {
      if (name != 'content-length') request.headers[name] = value;
    });

    final client = _httpClient ?? http.Client();
    try {
      final sending = client.send(request);
      await file.openRead().pipe(request.sink);
      final response = await sending;
      await response.stream.drain<void>();
      return switch (response.statusCode) {
        // 412: an earlier attempt already stored this upload; R2 keeps the
        // first copy, so carry on to completion.
        HttpStatus.ok ||
        HttpStatus.preconditionFailed => const ApiSuccess(null),
        // The URL expired or its signature no longer matches.
        HttpStatus.forbidden => const ApiError(Expired()),
        _ => const ApiError(ServiceUnavailable()),
      };
    } on IOException {
      return const ApiError(NetworkUnavailable());
    } on http.ClientException {
      return const ApiError(NetworkUnavailable());
    } finally {
      if (_httpClient == null) client.close();
    }
  }

  @override
  Future<ApiResult<MediaCheck>> complete(String reservationId) async {
    final api = await _api();
    if (api == null) return const ApiError(Unauthenticated());

    final http.Response response;
    try {
      response = await api.mediaReservationsCompleteWithHttpInfo(reservationId);
    } on generated.ApiException catch (error) {
      return ApiError(failureForStatus(error.code, error.innerException));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }

    final status = response.statusCode;
    if (status == HttpStatus.notFound ||
        status == HttpStatus.unprocessableEntity) {
      return const ApiError(NotFound());
    }
    if (status == HttpStatus.conflict) return const ApiError(Expired());
    if (status != HttpStatus.ok) {
      return ApiError(failureForStatus(status, null));
    }
    final json = _decode(response.body);
    final reason = json?['failureReason'];
    return switch (json?['status']) {
      'validated' => const ApiSuccess(MediaCheck(MediaCheckStatus.validated)),
      'pending' => const ApiSuccess(MediaCheck(MediaCheckStatus.pending)),
      'failed' => ApiSuccess(
        MediaCheck(
          MediaCheckStatus.failed,
          failureReason: reason is String ? reason : null,
        ),
      ),
      'expired' => const ApiError(Expired()),
      _ => const ApiError(ServiceUnavailable()),
    };
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

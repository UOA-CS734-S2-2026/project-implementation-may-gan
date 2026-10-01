import 'dart:convert';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;
import 'package:http/http.dart' as http;

import 'api_failure.dart';
import 'posting_day_client.dart' show failureForStatus;

/// A profile's name and, when the viewer may see it, its bio.
class ProfileDetails {
  const ProfileDetails({
    required this.id,
    required this.username,
    required this.displayName,
    required this.detailsVisible,
    required this.bio,
    required this.isOwner,
    this.isPrivate = false,
    this.usernameChangeAvailableAt,
  });

  final String id;

  /// The current handle, which differs from the one asked for when the owner
  /// has since changed it.
  final String username;
  final String displayName;

  /// False when the account is private and the viewer is not a friend.
  final bool detailsVisible;
  final String? bio;
  final bool isOwner;

  /// Owner only.
  final bool isPrivate;

  /// Owner only: when the username can next change, or null when it can now.
  final DateTime? usernameChangeAvailableAt;

  static ProfileDetails? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final id = json['id'];
    final username = json['username'];
    final displayName = json['displayName'];
    final detailsVisible = json['detailsVisible'];
    final bio = json['bio'];
    final owner = json['owner'];
    if (id is! String ||
        username is! String ||
        displayName is! String ||
        detailsVisible is! bool ||
        (bio != null && bio is! String) ||
        (owner != null && owner is! Map<String, Object?>)) {
      return null;
    }
    final settings = owner as Map<String, Object?>?;
    final availableAt = settings?['usernameChangeAvailableAt'];
    return ProfileDetails(
      id: id,
      username: username,
      displayName: displayName,
      detailsVisible: detailsVisible,
      bio: bio as String?,
      isOwner: settings != null,
      isPrivate: settings?['profileVisibility'] == 'private',
      usernameChangeAvailableAt: availableAt is String
          ? DateTime.tryParse(availableAt)
          : null,
    );
  }
}

abstract interface class ProfileClient {
  /// [NotFound] when the profile is unknown or blocked.
  Future<ApiResult<ProfileDetails>> details(String username);

  /// Sends only the fields given; blank text clears a field.
  Future<ApiResult<ProfileDetails>> update({
    String? bio,
    String? publicName,
    bool? isPrivate,
  });

  /// Returns the current handle. A taken handle or a change within 30 days of
  /// the last one is a [Conflict].
  Future<ApiResult<String>> changeUsername(String username);
}

/// Used where no profile API is configured, such as widget tests that never
/// open a profile.
class UnavailableProfileClient implements ProfileClient {
  const UnavailableProfileClient();

  @override
  Future<ApiResult<ProfileDetails>> details(String username) async =>
      const ApiError(ServiceUnavailable());

  @override
  Future<ApiResult<ProfileDetails>> update({
    String? bio,
    String? publicName,
    bool? isPrivate,
  }) async => const ApiError(ServiceUnavailable());

  @override
  Future<ApiResult<String>> changeUsername(String username) async =>
      const ApiError(ServiceUnavailable());
}

/// Calls the profile routes with the stored Better Auth bearer session. Bodies
/// are built and decoded here: the generated update model would send omitted
/// fields as null, which clears them.
class GeneratedProfileClient implements ProfileClient {
  GeneratedProfileClient({
    required String baseUrl,
    required this._bearerToken,
    this._httpClient,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');

  final String _baseUrl;
  final Future<String?> Function() _bearerToken;
  final http.Client? _httpClient;

  Future<generated.ApiClient?> _client() async {
    final token = await _bearerToken();
    if (token == null) return null;
    final auth = generated.HttpBearerAuth()..accessToken = token;
    final client = generated.ApiClient(
      basePath: _baseUrl,
      authentication: auth,
    );
    if (_httpClient != null) client.client = _httpClient;
    return client;
  }

  Future<ApiResult<T>> _send<T>(
    Future<http.Response> Function(generated.ApiClient client) request,
    T? Function(Object? json) parse,
  ) async {
    final client = await _client();
    if (client == null) return const ApiError(Unauthenticated());

    final http.Response response;
    try {
      response = await request(client);
    } on generated.ApiException catch (error) {
      return ApiError(failureForStatus(error.code, error.innerException));
    } on IOException {
      return const ApiError(NetworkUnavailable());
    }

    final Object? json;
    try {
      json = response.body.isEmpty ? null : jsonDecode(response.body);
    } on FormatException {
      return const ApiError(ServiceUnavailable());
    }
    final status = response.statusCode;
    if (status == HttpStatus.notFound) return const ApiError(NotFound());
    if (status == HttpStatus.conflict) return ApiError(_conflict(json));
    if (status == HttpStatus.unprocessableEntity) {
      return ApiError(InvalidRequest(_message(json) ?? 'Check your details.'));
    }
    if (status != HttpStatus.ok) {
      return ApiError(failureForStatus(status, null));
    }
    final value = parse(json);
    return value == null
        ? const ApiError(ServiceUnavailable())
        : ApiSuccess(value);
  }

  static String? _message(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final error = json['error'];
    if (error is! Map<String, Object?>) return null;
    final message = error['message'];
    return message is String ? message : null;
  }

  static Conflict _conflict(Object? json) {
    final error = json is Map<String, Object?> ? json['error'] : null;
    final details = error is Map<String, Object?> ? error['details'] : null;
    final availableAt = details is Map<String, Object?>
        ? details['availableAt']
        : null;
    return Conflict(
      _message(json) ?? 'That change is not available.',
      availableAt: availableAt is String
          ? DateTime.tryParse(availableAt)
          : null,
    );
  }

  @override
  Future<ApiResult<ProfileDetails>> details(String username) => _send(
    (client) =>
        generated.ProfileApi(client).profileGetDetailsWithHttpInfo(username),
    ProfileDetails.tryParse,
  );

  @override
  Future<ApiResult<ProfileDetails>> update({
    String? bio,
    String? publicName,
    bool? isPrivate,
  }) => _send(
    (client) => client.invokeAPI(
      '/api/v1/profile',
      'PATCH',
      [],
      {
        'bio': ?bio,
        'publicName': ?publicName,
        if (isPrivate != null)
          'profileVisibility': isPrivate ? 'private' : 'public',
      },
      {},
      {},
      'application/json',
    ),
    ProfileDetails.tryParse,
  );

  @override
  Future<ApiResult<String>> changeUsername(String username) => _send(
    (client) => generated.ProfileApi(client).profileChangeUsernameWithHttpInfo(
      generated.ChangeUsernameRequest(username: username),
    ),
    (json) => json is Map<String, Object?> && json['username'] is String
        ? json['username']! as String
        : null,
  );
}

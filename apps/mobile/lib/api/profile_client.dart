import 'dart:convert';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;
import 'package:http/http.dart' as http;

import 'api_failure.dart';
import 'posting_day_client.dart' show failureForStatus;

/// Server-confirmed posting streak values.
class PostingStreak {
  const PostingStreak({
    required this.current,
    required this.longest,
    required this.postedToday,
  });

  /// Consecutive days ending today, or yesterday while today is still open.
  final int current;
  final int longest;
  final bool postedToday;

  static PostingStreak? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final current = json['current'];
    final longest = json['longest'];
    final postedToday = json['postedToday'];
    if (current is! int || longest is! int || postedToday is! bool) {
      return null;
    }
    return PostingStreak(
      current: current,
      longest: longest,
      postedToday: postedToday,
    );
  }
}

/// Counts shown on a profile.
class ProfileStats {
  const ProfileStats({required this.posts, required this.friends});

  final int posts;
  final int friends;

  static ProfileStats? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final posts = json['posts'];
    final friends = json['friends'];
    if (posts is! int || friends is! int) return null;
    return ProfileStats(posts: posts, friends: friends);
  }
}

/// A profile's name and, when the viewer may see them, its bio and streak.
class ProfileDetails {
  const ProfileDetails({
    required this.id,
    required this.username,
    required this.displayName,
    required this.detailsVisible,
    required this.bio,
    required this.isOwner,
    this.mbti,
    this.whatIDo,
    this.listeningTo,
    this.avatarUrl,
    this.streak,
    this.stats,
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

  /// Null when unset or when the bio is hidden, like the next two.
  final String? mbti;
  final String? whatIDo;
  final String? listeningTo;

  /// A link to the profile photo that expires after 10 minutes; null when
  /// there is none or the bio is hidden.
  final String? avatarUrl;

  /// Null whenever the bio is hidden.
  final PostingStreak? streak;

  /// Null whenever the bio is hidden.
  final ProfileStats? stats;

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
      mbti: json['mbti'] is String ? json['mbti']! as String : null,
      whatIDo: json['whatIDo'] is String ? json['whatIDo']! as String : null,
      listeningTo: json['listeningTo'] is String
          ? json['listeningTo']! as String
          : null,
      avatarUrl: json['avatarUrl'] is String
          ? json['avatarUrl']! as String
          : null,
      streak: PostingStreak.tryParse(json['streak']),
      stats: ProfileStats.tryParse(json['stats']),
      isPrivate: settings?['profileVisibility'] == 'private',
      usernameChangeAvailableAt: availableAt is String
          ? DateTime.tryParse(availableAt)
          : null,
    );
  }
}

/// The ranges a mood history covers, each ending today in Auckland.
enum MoodRange {
  days30('30d', '30 days', '30 days'),
  days90('90d', '90 days', '90 days'),
  year('1y', 'Year', 'year');

  const MoodRange(this.wire, this.label, this.period);

  final String wire;
  final String label;

  /// How the range reads in "vs the … before".
  final String period;
}

/// One posted day and its rating.
class MoodDay {
  const MoodDay({required this.localDate, required this.rating});

  final String localDate;
  final int rating;

  static MoodDay? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final localDate = json['localDate'];
    final rating = json['rating'];
    if (localDate is! String || rating is! int) return null;
    return MoodDay(localDate: localDate, rating: rating);
  }
}

/// A summary of one range. [average], [lowest] and [highest] are null with
/// no posts.
class MoodPeriod {
  const MoodPeriod({
    required this.from,
    required this.to,
    required this.trackedDays,
    required this.postedDays,
    required this.missingDays,
    this.average,
    this.lowest,
    this.highest,
  });

  final String from;
  final String to;

  /// Days since the account's first day; earlier days are not missing data.
  final int trackedDays;
  final int postedDays;

  /// Tracked days that ended without a post. Today is not missing yet.
  final int missingDays;
  final double? average;
  final int? lowest;
  final int? highest;

  static MoodPeriod? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final from = json['from'];
    final to = json['to'];
    final tracked = json['trackedDays'];
    final posted = json['postedDays'];
    final missing = json['missingDays'];
    final average = json['average'];
    final lowest = json['lowest'];
    final highest = json['highest'];
    if (from is! String ||
        to is! String ||
        tracked is! int ||
        posted is! int ||
        missing is! int ||
        (average != null && average is! num) ||
        (lowest != null && lowest is! int) ||
        (highest != null && highest is! int)) {
      return null;
    }
    return MoodPeriod(
      from: from,
      to: to,
      trackedDays: tracked,
      postedDays: posted,
      missingDays: missing,
      average: (average as num?)?.toDouble(),
      lowest: lowest as int?,
      highest: highest as int?,
    );
  }
}

/// A profile's ratings over a range, with the range before it for
/// comparison. It reaches the same people as the profile's posts: the owner
/// and their active friends.
class MoodHistory {
  const MoodHistory({
    required this.trackedFrom,
    required this.days,
    required this.current,
    required this.previous,
    this.hiddenDays = const [],
  });

  /// The account's first day, or its earliest post if that is sooner.
  final String trackedFrom;

  /// Rated days in [current] the viewer can see, oldest first.
  final List<MoodDay> days;

  /// Days in [current] with a post the viewer can't see, such as a solo post.
  /// They are neither rated nor missing.
  final List<String> hiddenDays;
  final MoodPeriod current;
  final MoodPeriod previous;

  static MoodHistory? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final trackedFrom = json['trackedFrom'];
    final rawDays = json['days'];
    final rawHidden = json['hiddenDays'] ?? const <Object?>[];
    final current = MoodPeriod.tryParse(json['current']);
    final previous = MoodPeriod.tryParse(json['previous']);
    if (trackedFrom is! String ||
        rawDays is! List ||
        rawHidden is! List ||
        rawHidden.any((day) => day is! String) ||
        current == null ||
        previous == null) {
      return null;
    }
    final days = rawDays.map(MoodDay.tryParse).toList();
    if (days.any((day) => day == null)) return null;
    return MoodHistory(
      trackedFrom: trackedFrom,
      days: days.cast<MoodDay>(),
      hiddenDays: rawHidden.cast<String>(),
      current: current,
      previous: previous,
    );
  }
}

abstract interface class ProfileClient {
  /// [NotFound] when the profile is unknown or blocked.
  Future<ApiResult<ProfileDetails>> details(String username);

  /// Sends only the fields given; blank text (and a blank MBTI) clears a field.
  Future<ApiResult<ProfileDetails>> update({
    String? bio,
    String? publicName,
    bool? isPrivate,
    String? mbti,
    String? whatIDo,
    String? listeningTo,
  });

  /// Returns the current handle. A taken handle or a change within 30 days of
  /// the last one is a [Conflict].
  Future<ApiResult<String>> changeUsername(String username);

  /// A profile's mood history. [NotFound] when the profile is unknown or
  /// blocked; anyone but the owner and their friends is refused.
  Future<ApiResult<MoodHistory>> moodHistory(String username, MoodRange range);
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
    String? mbti,
    String? whatIDo,
    String? listeningTo,
  }) async => const ApiError(ServiceUnavailable());

  @override
  Future<ApiResult<String>> changeUsername(String username) async =>
      const ApiError(ServiceUnavailable());

  @override
  Future<ApiResult<MoodHistory>> moodHistory(
    String username,
    MoodRange range,
  ) async => const ApiError(ServiceUnavailable());
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
    String? mbti,
    String? whatIDo,
    String? listeningTo,
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
        'mbti': ?mbti,
        'whatIDo': ?whatIDo,
        'listeningTo': ?listeningTo,
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

  @override
  Future<ApiResult<MoodHistory>> moodHistory(
    String username,
    MoodRange range,
  ) => _send(
    (client) => generated.PostsApi(
      client,
    ).postsGetProfileMoodWithHttpInfo(username, range: range.wire),
    MoodHistory.tryParse,
  );
}

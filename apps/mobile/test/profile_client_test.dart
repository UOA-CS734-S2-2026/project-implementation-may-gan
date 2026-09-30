import 'dart:convert';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/profile_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, Object?> body({Map<String, Object?>? owner}) => {
  'id': 'user-1',
  'username': 'jos',
  'displayName': 'Jos',
  'detailsVisible': true,
  'bio': 'Walks.',
  'owner': owner,
};

void main() {
  late List<http.Request> requests;

  GeneratedProfileClient client(
    http.Response Function(http.Request) respond, {
    String? token = 'token-1',
  }) {
    requests = [];
    return GeneratedProfileClient(
      baseUrl: 'https://api.example.test/',
      bearerToken: () async => token,
      httpClient: MockClient((request) async {
        requests.add(request);
        return respond(request);
      }),
    );
  }

  test('reads the owner\'s settings from their own profile', () async {
    final result = await client(
      (_) => http.Response(
        jsonEncode(
          body(
            owner: {
              'profileVisibility': 'private',
              'usernameChangeAvailableAt': '2026-10-30T03:00:00.000Z',
            },
          ),
        ),
        200,
      ),
    ).details('jos');

    expect(requests.single.url.path, '/api/v1/profiles/jos');
    expect(requests.single.headers['authorization'], 'Bearer token-1');
    final profile = (result as ApiSuccess<ProfileDetails>).value;
    expect(profile.isOwner, isTrue);
    expect(profile.isPrivate, isTrue);
    expect(profile.usernameChangeAvailableAt, DateTime.utc(2026, 10, 30, 3));
  });

  test('sends only the fields being changed', () async {
    await client(
      (_) => http.Response(
        jsonEncode(
          body(
            owner: {
              'profileVisibility': 'private',
              'usernameChangeAvailableAt': null,
            },
          ),
        ),
        200,
      ),
    ).update(isPrivate: true);

    expect(requests.single.method, 'PATCH');
    expect(requests.single.url.path, '/api/v1/profile');
    expect(jsonDecode(requests.single.body), {'profileVisibility': 'private'});
  });

  test('reports when a username change must wait', () async {
    final result = await client(
      (_) => http.Response(
        jsonEncode({
          'error': {
            'code': 'CONFLICT',
            'message': 'You can change your username once every 30 days.',
            'details': {
              'reason': 'tooSoon',
              'availableAt': '2026-10-30T03:00:00.000Z',
            },
          },
        }),
        409,
      ),
    ).changeUsername('jos_walks');

    expect(requests.single.method, 'PUT');
    expect(jsonDecode(requests.single.body), {'username': 'jos_walks'});
    final failure = (result as ApiError<String>).failure as Conflict;
    expect(failure.message, 'You can change your username once every 30 days.');
    expect(failure.availableAt, DateTime.utc(2026, 10, 30, 3));
  });

  test('treats an unknown or blocked profile as not found', () async {
    final result = await client((_) => http.Response('{}', 404)).details('x');

    expect((result as ApiError).failure, isA<NotFound>());
  });
}

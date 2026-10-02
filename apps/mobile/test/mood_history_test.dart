import 'dart:convert';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/profile_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'home_feed_test.dart' show signIn;
import 'profile_details_test.dart' show details;
import 'profile_posts_test.dart'
    show ProfileFriendsClient, ada, bea, me, openProfile, testProfile;
import 'support/fakes.dart';

Map<String, Object?> period({
  String from = '2026-09-01',
  String to = '2026-09-30',
  int tracked = 30,
  int posted = 3,
  int missing = 27,
  num? average = 7,
}) => {
  'from': from,
  'to': to,
  'trackedDays': tracked,
  'postedDays': posted,
  'missingDays': missing,
  'average': average,
  'lowest': average == null ? null : 6,
  'highest': average == null ? null : 8,
};

Map<String, Object?> historyJson({
  String trackedFrom = '2026-01-01',
  Map<String, Object?>? previous,
}) => {
  'range': '30d',
  'trackedFrom': trackedFrom,
  'days': [
    {'localDate': '2026-09-27', 'rating': 6},
    {'localDate': '2026-09-28', 'rating': 8},
    {'localDate': '2026-09-30', 'rating': 7},
  ],
  'current': period(),
  'previous':
      previous ??
      period(
        from: '2026-08-02',
        to: '2026-08-31',
        posted: 18,
        missing: 12,
        average: 6.6,
      ),
};

MoodHistory history({
  String trackedFrom = '2026-01-01',
  Map<String, Object?>? previous,
}) => MoodHistory.tryParse(
  historyJson(trackedFrom: trackedFrom, previous: previous),
)!;

Future<void> openMyDays(WidgetTester tester, TestHarness harness) async {
  await signIn(tester, harness);
  await tester.tap(find.byKey(const Key('shell.nav.my days')));
  await tester.pumpAndSettle();
}

void main() {
  test('reads the caller\'s mood history for a range', () async {
    final requests = <http.Request>[];
    final client = GeneratedProfileClient(
      baseUrl: 'https://api.example.test/',
      bearerToken: () async => 'token-1',
      httpClient: MockClient((request) async {
        requests.add(request);
        return http.Response(jsonEncode(historyJson()), 200);
      }),
    );

    final result = await client.moodHistory('ada', MoodRange.days90);

    expect(requests.single.url.path, '/api/v1/profiles/ada/mood');
    expect(requests.single.url.queryParameters, {'range': '90d'});
    final value = (result as ApiSuccess<MoodHistory>).value;
    expect(value.days.map((day) => day.rating), [6, 8, 7]);
    expect(value.current.average, 7.0);
    expect(value.previous.postedDays, 18);
  });

  test('reads hidden days and rejects a malformed body', () {
    expect(
      MoodHistory.tryParse({
        ...historyJson(),
        'hiddenDays': ['2026-09-29'],
      })?.hiddenDays,
      ['2026-09-29'],
    );
    expect(
      MoodHistory.tryParse({
        ...historyJson(),
        'hiddenDays': [3],
      }),
      isNull,
    );
  });

  test('keeps a range with no posts and rejects a malformed body', () {
    final empty = MoodHistory.tryParse({
      ...historyJson(),
      'days': <Object?>[],
      'previous': period(posted: 0, average: null),
    });
    expect(empty?.previous.average, isNull);
    expect(MoodHistory.tryParse({...historyJson(), 'days': 'nope'}), isNull);
  });

  testProfile('shows your mood on my days with sample sizes', (tester) async {
    final profiles = FakeProfileClient({
      'jos': details('jos', displayName: 'Jos', owner: true),
    })..moodResult = ApiSuccess(history());
    final harness = TestHarness(
      friends: ProfileFriendsClient({'jos': me}),
      profiles: profiles,
    );
    await openMyDays(tester, harness);

    expect(find.byKey(const Key('profile.mood')), findsOneWidget);
    expect(find.byKey(const Key('profile.mood.chart')), findsOneWidget);
    expect(find.text('Average rating'), findsNothing);
    expect(find.text('Days without a post'), findsNothing);
    expect(profiles.moodRequests, [('jos', MoodRange.days30)]);
  });

  testProfile('switches range and reads a day by tapping', (tester) async {
    final profiles = FakeProfileClient({
      'jos': details('jos', displayName: 'Jos', owner: true),
    })..moodResult = ApiSuccess(history());
    final harness = TestHarness(
      friends: ProfileFriendsClient({'jos': me}),
      profiles: profiles,
    );
    await openMyDays(tester, harness);

    await tester.tap(find.byKey(const Key('profile.mood.1y')));
    await tester.pumpAndSettle();
    expect(profiles.moodRequests, [
      ('jos', MoodRange.days30),
      ('jos', MoodRange.year),
    ]);

    final chart = find.byKey(const Key('profile.mood.chart'));
    await tester.ensureVisible(chart);
    await tester.pumpAndSettle();
    final box = tester.getRect(chart);
    await tester.tapAt(Offset(box.right - 9, box.center.dy));
    await tester.pumpAndSettle();
    expect(find.text('30 Sept 2026: Rating of 7'), findsOneWidget);
  });

  testProfile('does not count days before joining', (tester) async {
    final profiles =
        FakeProfileClient({
            'jos': details('jos', displayName: 'Jos', owner: true),
          })
          ..moodResult = ApiSuccess(
            history(
              trackedFrom: '2026-09-21',
              previous: period(
                from: '2026-08-02',
                to: '2026-08-31',
                tracked: 0,
                posted: 0,
                missing: 0,
                average: null,
              ),
            ),
          );
    final harness = TestHarness(
      friends: ProfileFriendsClient({'jos': me}),
      profiles: profiles,
    );
    await openMyDays(tester, harness);

    expect(find.textContaining('You joined on 21 Sept 2026'), findsOneWidget);
  });

  testProfile('says when the history is unavailable', (tester) async {
    final profiles = FakeProfileClient({
      'jos': details('jos', displayName: 'Jos', owner: true),
    })..moodResult = const ApiError(NetworkUnavailable());
    final harness = TestHarness(
      friends: ProfileFriendsClient({'jos': me}),
      profiles: profiles,
    );
    await openMyDays(tester, harness);

    expect(find.byKey(const Key('profile.mood.error')), findsOneWidget);
  });

  testProfile('shows a friend\'s mood to their friends', (tester) async {
    final profiles = FakeProfileClient({
      'ada': details('ada', displayName: 'Ada'),
    })..moodResult = ApiSuccess(history());
    final harness = TestHarness(
      friends: ProfileFriendsClient({'ada': ada}),
      profiles: profiles,
    );
    await openProfile(tester, harness, 'ada');

    expect(find.byKey(const Key('profile.mood')), findsOneWidget);
    expect(
      find.textContaining("Only Ada's friends can see this."),
      findsOneWidget,
    );
    expect(profiles.moodRequests, [('ada', MoodRange.days30)]);
  });

  testProfile('is not shown to someone who is not a friend', (tester) async {
    final profiles = FakeProfileClient({
      'bea': details('bea', displayName: 'Bea'),
    })..moodResult = ApiSuccess(history());
    final harness = TestHarness(
      friends: ProfileFriendsClient({'bea': bea}),
      profiles: profiles,
    );
    await openProfile(tester, harness, 'bea');

    expect(find.byKey(const Key('profile.mood')), findsNothing);
    expect(profiles.moodRequests, isEmpty);
  });
}

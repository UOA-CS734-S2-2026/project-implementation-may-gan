import 'dart:async';

import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/compose/composer_screen.dart';
import 'package:dayli_mobile/compose/weather_input.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/weather/coordinates.dart';
import 'package:dayli_mobile/weather/post_weather.dart';
import 'package:dayli_mobile/weather/weather_failure.dart';
import 'package:dayli_mobile/weather/weather_location.dart';
import 'package:dayli_mobile/weather/weather_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

const _add = Key('composer.weather.add');
const _card = Key('composer.weather.card');
const _remove = Key('composer.weather.remove');
const _problem = Key('composer.weather.problem');
const _useLocation = Key('composer.weather.sheet.location');
const _choosePlaceInstead = Key('composer.weather.sheet.place');
const _notNow = Key('composer.weather.sheet.decline');

const rainInAuckland = PostWeather(
  condition: WeatherCondition.rain,
  temperatureC: 11,
  placeName: 'Auckland',
);

const queenstown = PlaceMatch(
  name: 'Queenstown',
  label: 'Queenstown, Otago, New Zealand',
  coordinates: Coordinates(-45.03, 168.66),
);

Future<void> _openComposer(WidgetTester tester, TestHarness harness) async {
  await tester.pumpWidget(
    DayliApp(services: harness.services, useGoogleFonts: false),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('landing.sign-in')));
  await tester.pumpAndSettle();
  await tester.enterText(
    find.byKey(const Key('auth.email')),
    'jos@example.test',
  );
  await tester.enterText(
    find.byKey(const Key('auth.password')),
    'correct-password',
  );
  await tester.tap(find.byKey(const Key('auth.submit')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('shell.newDayli')));
  await tester.pumpAndSettle();
}

Finder _list() => find
    .descendant(
      of: find.byType(ComposerScreen),
      matching: find.byType(Scrollable),
    )
    .first;

/// The form builds lazily, so a row below the fold exists only once scrolled
/// into view.
Future<void> _scrollTo(WidgetTester tester, Key key) async {
  final target = find.byKey(key);
  if (target.evaluate().isNotEmpty) {
    await tester.ensureVisible(target);
    return;
  }
  // The row may be above or below where an earlier step left the list.
  try {
    await tester.scrollUntilVisible(target, 150, scrollable: _list());
  } on StateError {
    await tester.scrollUntilVisible(target, -150, scrollable: _list());
  }
}

Future<void> _tap(WidgetTester tester, Key key) async {
  await _scrollTo(tester, key);
  await tester.pump();
  await tester.tap(find.byKey(key));
  await tester.pumpAndSettle();
}

/// Opens the explanation from the composer's weather row.
Future<void> _openExplanation(WidgetTester tester) => _tap(tester, _add);

/// Taps "Use my location" in the explanation.
Future<void> _tapUseMyLocation(WidgetTester tester) async {
  await _openExplanation(tester);
  await tester.tap(find.byKey(_useLocation));
  await tester.pumpAndSettle();
}

String _text(WidgetTester tester, Key key) =>
    tester.widget<Text>(find.byKey(key)).data!;

Future<DailyPostDraft> _saved(WidgetTester tester, TestHarness harness) async {
  await tester.pump(const Duration(seconds: 1));
  return harness.drafts.drafts['user-1']!;
}

void main() {
  late TestHarness harness;

  setUp(() => harness = TestHarness());

  group('before the author does anything', () {
    testWidgets('offers the weather as optional and touches nothing', (
      tester,
    ) async {
      await _openComposer(tester, harness);
      await tester.pumpAndSettle(const Duration(seconds: 2));
      await _scrollTo(tester, _add);

      expect(find.byKey(_add), findsOneWidget);
      expect(find.text('Add the weather'), findsOneWidget);
      expect(find.textContaining('Optional'), findsWidgets);
      expect(find.byKey(_card), findsNothing);
      // Opening the composer never asks for location or reads it.
      expect(harness.weatherLocation.requests, 0);
      expect(harness.weatherLocation.positions, 0);
      expect(harness.weatherProvider.readings, isEmpty);
      expect(harness.weatherProvider.searches, isEmpty);
    });
  });

  group('the explanation', () {
    testWidgets('comes before the system prompt and says what is kept', (
      tester,
    ) async {
      await _openComposer(tester, harness);
      await _openExplanation(tester);

      expect(
        find.byKey(const Key('composer.weather.sheet.title')),
        findsOneWidget,
      );
      expect(find.textContaining('approximate location once'), findsOneWidget);
      expect(find.textContaining("isn't sent to Dayli"), findsOneWidget);
      expect(
        find.textContaining('remove them before you post'),
        findsOneWidget,
      );
      expect(find.textContaining('Open-Meteo.com'), findsOneWidget);
      expect(find.byKey(_useLocation), findsOneWidget);
      expect(find.byKey(_choosePlaceInstead), findsOneWidget);
      expect(find.byKey(_notNow), findsOneWidget);
      // Nothing has been asked yet.
      expect(harness.weatherLocation.requests, 0);
      expect(harness.weatherLocation.positions, 0);
    });

    testWidgets('"Not now" costs nothing and can be reopened', (tester) async {
      await _openComposer(tester, harness);
      await _openExplanation(tester);
      await tester.tap(find.byKey(_notNow));
      await tester.pumpAndSettle();

      expect(find.byKey(_card), findsNothing);
      expect(find.byKey(_add), findsOneWidget);
      expect(find.byKey(_problem), findsNothing);
      expect(harness.weatherLocation.requests, 0);
      expect(harness.weatherLocation.positions, 0);
      expect(harness.weatherProvider.readings, isEmpty);

      await _openExplanation(tester);
      expect(
        find.byKey(const Key('composer.weather.sheet.title')),
        findsOneWidget,
      );
    });
  });

  group('using the phone\'s location', () {
    testWidgets('shows the system prompt once, then the weather', (
      tester,
    ) async {
      await _openComposer(tester, harness);
      await _tapUseMyLocation(tester);

      expect(harness.weatherLocation.requests, 1);
      expect(find.byKey(_card), findsOneWidget);
      expect(
        _text(tester, const Key('composer.weather.summary')),
        'Rain · 11°C · Auckland',
      );
      expect(find.textContaining('Open-Meteo.com'), findsOneWidget);
      expect((await _saved(tester, harness)).weather, rainInAuckland);
      // Only the neighbourhood was ever used.
      expect(harness.weatherProvider.readings, [
        const Coordinates(-36.85, 174.76),
      ]);
    });

    testWidgets('does not show the prompt again once location is allowed', (
      tester,
    ) async {
      harness.weatherLocation.permission = LocationPermissionStatus.granted;
      await _openComposer(tester, harness);
      await _tapUseMyLocation(tester);

      expect(harness.weatherLocation.requests, 0);
      expect(find.byKey(_card), findsOneWidget);
    });

    testWidgets('shows that it is working while it waits', (tester) async {
      harness.weatherProvider.hold = Completer<void>();
      await _openComposer(tester, harness);
      await _openExplanation(tester);
      await tester.tap(find.byKey(_useLocation));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.byKey(const Key('composer.weather.working')), findsOneWidget);
      expect(find.byKey(_add), findsNothing);

      harness.weatherProvider.hold!.complete();
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('composer.weather.working')), findsNothing);
      expect(find.byKey(_card), findsOneWidget);
    });

    testWidgets('removes the weather and offers it again', (tester) async {
      await _openComposer(tester, harness);
      await _tapUseMyLocation(tester);
      await _tap(tester, _remove);

      expect(find.byKey(_card), findsNothing);
      expect(find.byKey(_add), findsOneWidget);
      expect((await _saved(tester, harness)).weather, isNull);
    });
  });

  group('when location is refused', () {
    testWidgets('keeps going without it after a refusal the system may ask '
        'about again', (tester) async {
      harness.weatherLocation.afterRequest = LocationPermissionStatus.askable;
      await _openComposer(tester, harness);
      await _tapUseMyLocation(tester);

      expect(harness.weatherLocation.requests, 1);
      expect(find.byKey(_card), findsNothing);
      expect(
        _text(tester, _problem),
        "Dayli can't see where you are. You can choose a place instead.",
      );
      expect(
        find.byKey(const Key('composer.weather.choosePlace')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('composer.weather.retry')), findsOneWidget);
      expect(find.byKey(const Key('composer.weather.settings')), findsNothing);
      expect(harness.weatherLocation.positions, 0);
      expect(harness.weatherProvider.readings, isEmpty);
      await tester.pump(const Duration(seconds: 1));
      // Nothing was added and nothing else was typed, so no draft is kept.
      expect(harness.drafts.drafts['user-1']?.weather, isNull);
    });

    testWidgets('points to Settings when the system will not ask again', (
      tester,
    ) async {
      harness.weatherLocation.afterRequest = LocationPermissionStatus.blocked;
      await _openComposer(tester, harness);
      await _tapUseMyLocation(tester);

      expect(find.byKey(_card), findsNothing);
      expect(_text(tester, _problem), contains('turn it on in Settings'));
      expect(find.byKey(const Key('composer.weather.retry')), findsNothing);

      await _tap(tester, const Key('composer.weather.settings'));
      expect(harness.weatherLocation.settingsOpened, 1);
      expect(harness.weatherLocation.positions, 0);
    });

    testWidgets('goes straight to Settings when already blocked, without '
        'another system prompt', (tester) async {
      harness.weatherLocation.permission = LocationPermissionStatus.blocked;
      await _openComposer(tester, harness);
      await _tapUseMyLocation(tester);

      expect(harness.weatherLocation.requests, 0);
      expect(
        find.byKey(const Key('composer.weather.settings')),
        findsOneWidget,
      );
    });

    testWidgets('points to the location switch when location is off', (
      tester,
    ) async {
      harness.weatherLocation.services = false;
      await _openComposer(tester, harness);
      await _tapUseMyLocation(tester);

      expect(find.byKey(_card), findsNothing);
      expect(_text(tester, _problem), contains('switched off on this phone'));
      expect(harness.weatherLocation.requests, 0);

      await _tap(tester, const Key('composer.weather.locationSettings'));
      expect(harness.weatherLocation.locationSettingsOpened, 1);
    });

    testWidgets('lets the author choose a place after a refusal', (
      tester,
    ) async {
      harness.weatherLocation.afterRequest = LocationPermissionStatus.blocked;
      harness.weatherProvider.places = const [queenstown];
      await _openComposer(tester, harness);
      await _tapUseMyLocation(tester);
      await _tap(tester, const Key('composer.weather.choosePlace'));
      await tester.enterText(
        find.byKey(const Key('composer.weather.search')),
        'queen',
      );
      await tester.pump(const Duration(milliseconds: 450));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('composer.weather.place.0')));
      await tester.pumpAndSettle();
      await _scrollTo(tester, _card);

      expect(find.byKey(_card), findsOneWidget);
      expect(
        _text(tester, const Key('composer.weather.summary')),
        'Rain · 11°C · Queenstown',
      );
      expect(find.byKey(_problem), findsNothing);
      expect(harness.weatherLocation.positions, 0);
    });
  });

  group('when the weather cannot be fetched', () {
    testWidgets('says so and lets the author try again', (tester) async {
      harness.weatherProvider.failure = WeatherFailure.offline;
      await _openComposer(tester, harness);
      await _tapUseMyLocation(tester);

      expect(_text(tester, _problem), contains("You're offline"));
      expect(find.byKey(_card), findsNothing);

      harness.weatherProvider.failure = null;
      await _tap(tester, const Key('composer.weather.retry'));
      await tester.tap(find.byKey(_useLocation));
      await tester.pumpAndSettle();
      await _scrollTo(tester, _card);

      expect(find.byKey(_card), findsOneWidget);
      expect(find.byKey(_problem), findsNothing);
    });

    testWidgets('asks for a place when the phone cannot name one', (
      tester,
    ) async {
      harness.weatherPlaceNamer.name = null;
      await _openComposer(tester, harness);
      await _tapUseMyLocation(tester);

      expect(_text(tester, _problem), contains("Couldn't tell which place"));
      expect(
        find.byKey(const Key('composer.weather.choosePlace')),
        findsOneWidget,
      );
    });

    testWidgets('explains a provider that sent unusable data', (tester) async {
      harness.weatherProvider.failure = WeatherFailure.invalidProviderData;
      await _openComposer(tester, harness);
      await _tapUseMyLocation(tester);

      expect(_text(tester, _problem), contains('could not use'));
      expect(find.byKey(_card), findsNothing);
    });

    testWidgets('never shows a position in any message', (tester) async {
      for (final failure in WeatherFailure.values) {
        expect(_noPosition(failure), isTrue, reason: failure.name);
      }
    });
  });

  group('choosing a place', () {
    Future<void> openSearch(WidgetTester tester) async {
      await _openExplanation(tester);
      await tester.tap(find.byKey(_choosePlaceInstead));
      await tester.pumpAndSettle();
    }

    Future<void> type(WidgetTester tester, String query) async {
      await tester.enterText(
        find.byKey(const Key('composer.weather.search')),
        query,
      );
      await tester.pump(const Duration(milliseconds: 450));
      await tester.pumpAndSettle();
    }

    testWidgets('needs no location permission at all', (tester) async {
      harness.weatherLocation.permission = LocationPermissionStatus.blocked;
      harness.weatherLocation.services = false;
      harness.weatherProvider.places = const [queenstown];
      await _openComposer(tester, harness);
      await openSearch(tester);
      await type(tester, 'queen');
      await tester.tap(find.byKey(const Key('composer.weather.place.0')));
      await tester.pumpAndSettle();

      expect(find.byKey(_card), findsOneWidget);
      expect(harness.weatherLocation.requests, 0);
      expect(harness.weatherLocation.positions, 0);
      expect(harness.weatherProvider.readings, [queenstown.coordinates]);
      expect((await _saved(tester, harness)).weather?.placeName, 'Queenstown');
    });

    testWidgets('waits for a pause before searching and skips short text', (
      tester,
    ) async {
      harness.weatherProvider.places = const [queenstown];
      await _openComposer(tester, harness);
      await openSearch(tester);
      await tester.enterText(
        find.byKey(const Key('composer.weather.search')),
        'q',
      );
      await tester.pump(const Duration(milliseconds: 600));
      expect(harness.weatherProvider.searches, isEmpty);

      await tester.enterText(
        find.byKey(const Key('composer.weather.search')),
        'qu',
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.enterText(
        find.byKey(const Key('composer.weather.search')),
        'que',
      );
      await tester.pump(const Duration(milliseconds: 450));
      await tester.pumpAndSettle();

      expect(harness.weatherProvider.searches, ['que']);
    });

    testWidgets('says when nothing matches', (tester) async {
      await _openComposer(tester, harness);
      await openSearch(tester);
      await type(tester, 'zzzz');

      expect(find.byKey(const Key('composer.weather.empty')), findsOneWidget);
      expect(find.byKey(const Key('composer.weather.place.0')), findsNothing);
    });

    testWidgets('says when the search fails', (tester) async {
      harness.weatherProvider.failure = WeatherFailure.offline;
      await _openComposer(tester, harness);
      await openSearch(tester);
      await type(tester, 'queen');

      expect(
        find.byKey(const Key('composer.weather.search.problem')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('composer.weather.place.0')), findsNothing);
    });

    testWidgets('adds nothing when the sheet is closed', (tester) async {
      harness.weatherProvider.places = const [queenstown];
      await _openComposer(tester, harness);
      await openSearch(tester);
      await type(tester, 'queen');
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      expect(find.byKey(_card), findsNothing);
      expect(harness.weatherProvider.readings, isEmpty);
    });
  });

  group('a saved draft', () {
    testWidgets('comes back with its weather and asks for nothing', (
      tester,
    ) async {
      await harness.drafts.write(
        DailyPostDraft(
          userId: 'user-1',
          localDate: '2026-09-25',
          promptId: 'prompt-09-25',
          promptText: 'What made you smile today?',
          idempotencyKey: 'saved-key',
          updatedAt: DateTime.utc(2026, 9, 25),
          reflectiveAnswer: 'Half written',
          weather: rainInAuckland,
        ),
      );
      await _openComposer(tester, harness);
      await tester.pumpAndSettle(const Duration(seconds: 2));
      await _scrollTo(tester, _card);

      expect(
        _text(tester, const Key('composer.weather.summary')),
        'Rain · 11°C · Auckland',
      );
      expect(harness.weatherLocation.requests, 0);
      expect(harness.weatherLocation.positions, 0);
      expect(harness.weatherProvider.readings, isEmpty);
    });
  });

  testWidgets('the composer still builds without the weather section being '
      'needed to post', (tester) async {
    await _openComposer(tester, harness);

    expect(find.byType(ComposerScreen), findsOneWidget);
    expect(find.byKey(_card), findsNothing);
  });
}

bool _noPosition(WeatherFailure failure) {
  final message = _message(failure);
  return !RegExp(r'\d').hasMatch(message) &&
      !message.toLowerCase().contains('latitude') &&
      !message.toLowerCase().contains('coordinates');
}

String _message(WeatherFailure failure) => weatherFailureMessage(failure);

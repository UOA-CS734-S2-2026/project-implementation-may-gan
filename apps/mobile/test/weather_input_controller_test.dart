import 'dart:async';

import 'package:dayli_mobile/compose/weather_input_controller.dart';
import 'package:dayli_mobile/weather/coordinates.dart';
import 'package:dayli_mobile/weather/post_weather.dart';
import 'package:dayli_mobile/weather/weather_failure.dart';
import 'package:dayli_mobile/weather/weather_lookup.dart';
import 'package:dayli_mobile/weather/weather_provider.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/weather_fakes.dart';

void main() {
  late FakeWeatherProvider provider;
  late FakeLocationAccess location;
  late List<PostWeather> received;
  late WeatherInputController controller;
  var disposedByTest = false;

  setUp(() {
    disposedByTest = false;
    provider = FakeWeatherProvider();
    location = FakeLocationAccess();
    received = [];
    controller = WeatherInputController(
      lookup: WeatherLookup(
        provider: provider,
        location: location,
        placeNamer: FakePlaceNamer(),
      ),
      onWeather: received.add,
    );
  });

  tearDown(() {
    if (!disposedByTest) controller.dispose();
  });

  /// Whether [signal] has completed, without waiting on it.
  Future<bool> fired(Future<void>? signal) async {
    var done = false;
    unawaited(signal?.then((_) => done = true));
    await Future<void>.delayed(Duration.zero);
    return done;
  }

  Future<void> startSlowLocation() async {
    location.positionHold = Completer<void>();
    unawaited(controller.useCurrentLocation());
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    expect(location.positions, 1);
  }

  test('gives the location request a way to be stopped', () async {
    await startSlowLocation();

    expect(location.positionSignals.single, isNotNull);
    expect(await fired(location.positionSignals.single), isFalse);

    location.positionHold!.complete();
    await Future<void>.delayed(Duration.zero);
  });

  test('stops the location request when the author skips', () async {
    await startSlowLocation();

    controller.cancel();

    expect(controller.isWorking, isFalse);
    expect(await fired(location.positionSignals.single), isTrue);

    // A fix that still arrives is ignored.
    location.positionHold!.complete();
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    expect(received, isEmpty);
    expect(controller.failure, isNull);
  });

  test('stops the location request when the composer is closed', () async {
    await startSlowLocation();

    controller.dispose();
    disposedByTest = true;

    expect(await fired(location.positionSignals.single), isTrue);
    location.positionHold!.complete();
    await Future<void>.delayed(Duration.zero);
    expect(received, isEmpty);
  });

  test('leaves a finished lookup alone', () async {
    unawaited(controller.useCurrentLocation());
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);

    expect(received, hasLength(1));
    final signal = location.positionSignals.single;
    controller.cancel();
    controller.dispose();
    disposedByTest = true;

    // Nothing was in flight, so nothing is signalled.
    expect(await fired(signal), isFalse);
  });

  test('does not ask the phone for a position when choosing a place', () async {
    await controller.usePlace(
      const PlaceMatch(
        name: 'Queenstown',
        label: 'Queenstown, Otago, New Zealand',
        coordinates: Coordinates(-45.03, 168.66),
      ),
    );

    expect(location.positions, 0);
    expect(location.positionSignals, isEmpty);
    expect(received, hasLength(1));
  });

  test('a skipped lookup does not stop the next one', () async {
    await startSlowLocation();
    controller.cancel();
    final first = location.positionSignals.single;
    location.positionHold!.complete();
    await Future<void>.delayed(Duration.zero);

    location.positionHold = null;
    await controller.useCurrentLocation();

    expect(received, hasLength(1));
    expect(await fired(first), isTrue);
    expect(await fired(location.positionSignals.last), isFalse);
  });

  test('reports a failure from the phone', () async {
    location.positionFailure = WeatherFailure.locationTimedOut;

    await controller.useCurrentLocation();

    expect(controller.failure, WeatherFailure.locationTimedOut);
    expect(received, isEmpty);
  });
}

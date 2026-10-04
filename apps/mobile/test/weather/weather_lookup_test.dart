import 'package:dayli_mobile/weather/coordinates.dart';
import 'package:dayli_mobile/weather/post_weather.dart';
import 'package:dayli_mobile/weather/weather_failure.dart';
import 'package:dayli_mobile/weather/weather_location.dart';
import 'package:dayli_mobile/weather/weather_lookup.dart';
import 'package:dayli_mobile/weather/weather_provider.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/weather_fakes.dart';

void main() {
  late FakeWeatherProvider provider;
  late FakeLocationAccess location;
  late FakePlaceNamer namer;
  late WeatherLookup lookup;

  setUp(() {
    provider = FakeWeatherProvider();
    location = FakeLocationAccess();
    namer = FakePlaceNamer();
    lookup = WeatherLookup(
      provider: provider,
      location: location,
      placeNamer: namer,
    );
  });

  Future<WeatherFailure> failureOf(Future<Object?> Function() action) async {
    try {
      await action();
    } on WeatherException catch (error) {
      return error.failure;
    }
    throw StateError('expected a WeatherException');
  }

  group('at the current location', () {
    test('makes a snapshot from the phone\'s position and place', () async {
      final weather = await lookup.atCurrentLocation();

      expect(
        weather,
        const PostWeather(
          condition: WeatherCondition.rain,
          temperatureC: 11,
          placeName: 'Auckland',
        ),
      );
      expect(location.positions, 1);
    });

    test(
      'hands the provider and the geocoder only the neighbourhood',
      () async {
        await lookup.atCurrentLocation();

        const approximate = Coordinates(-36.85, 174.76);
        expect(provider.readings, [approximate]);
        expect(namer.asked, [approximate]);
      },
    );

    test('never shows the system prompt itself', () async {
      for (final status in LocationPermissionStatus.values) {
        location.permission = status;
        try {
          await lookup.atCurrentLocation();
        } on WeatherException {
          // Expected for the two states that are not granted.
        }
      }

      expect(location.requests, 0);
    });

    test(
      'explains a permission that is not granted, without reading location',
      () async {
        location.permission = LocationPermissionStatus.askable;
        expect(
          await failureOf(lookup.atCurrentLocation),
          WeatherFailure.permissionDenied,
        );

        location.permission = LocationPermissionStatus.blocked;
        expect(
          await failureOf(lookup.atCurrentLocation),
          WeatherFailure.permissionBlocked,
        );

        expect(location.positions, 0);
        expect(provider.readings, isEmpty);
        expect(namer.asked, isEmpty);
      },
    );

    test(
      'reports location services switched off before anything else',
      () async {
        location.services = false;
        location.permission = LocationPermissionStatus.blocked;

        expect(
          await failureOf(lookup.atCurrentLocation),
          WeatherFailure.servicesDisabled,
        );
        expect(location.positions, 0);
      },
    );

    test('passes on why the phone could not find its position', () async {
      for (final failure in [
        WeatherFailure.locationTimedOut,
        WeatherFailure.locationUnavailable,
        WeatherFailure.permissionDenied,
        WeatherFailure.servicesDisabled,
      ]) {
        location.positionFailure = failure;

        expect(await failureOf(lookup.atCurrentLocation), failure);
      }
      expect(provider.readings, isEmpty);
    });

    test('passes on every provider failure', () async {
      for (final failure in [
        WeatherFailure.offline,
        WeatherFailure.providerTimedOut,
        WeatherFailure.providerUnavailable,
        WeatherFailure.invalidProviderData,
      ]) {
        provider.failure = failure;

        expect(await failureOf(lookup.atCurrentLocation), failure);
      }
    });

    test('asks for a place instead when the phone cannot name one', () async {
      namer.name = null;
      expect(
        await failureOf(lookup.atCurrentLocation),
        WeatherFailure.placeNameUnavailable,
      );

      for (final unusable in ['', ' ', ' Auckland', 'a' * 81, 'Auck\nland']) {
        namer.name = unusable;
        expect(
          await failureOf(lookup.atCurrentLocation),
          WeatherFailure.placeNameUnavailable,
          reason: unusable,
        );
      }
    });

    test('reports the provider failure when the name is missing too', () async {
      provider.failure = WeatherFailure.offline;
      namer.name = null;

      expect(await failureOf(lookup.atCurrentLocation), WeatherFailure.offline);
    });
  });

  group('at a chosen place', () {
    const queenstown = PlaceMatch(
      name: 'Queenstown',
      label: 'Queenstown, Otago, New Zealand',
      coordinates: Coordinates(-45.03, 168.66),
    );

    test('needs no permission and no phone location', () async {
      location.permission = LocationPermissionStatus.blocked;
      location.services = false;
      provider.reading = const WeatherReading(
        condition: WeatherCondition.snow,
        temperatureC: -3,
      );

      final weather = await lookup.atPlace(queenstown);

      expect(
        weather,
        const PostWeather(
          condition: WeatherCondition.snow,
          temperatureC: -3,
          placeName: 'Queenstown',
        ),
      );
      expect(provider.readings, [queenstown.coordinates]);
      expect(location.positions, 0);
      expect(location.requests, 0);
      expect(namer.asked, isEmpty);
    });

    test('passes on a provider failure', () async {
      provider.failure = WeatherFailure.providerUnavailable;

      expect(
        await failureOf(() => lookup.atPlace(queenstown)),
        WeatherFailure.providerUnavailable,
      );
    });

    test('refuses a place whose name the API would reject', () async {
      const bad = PlaceMatch(
        name: ' Queenstown',
        label: 'x',
        coordinates: Coordinates(-45.03, 168.66),
      );

      expect(
        await failureOf(() => lookup.atPlace(bad)),
        WeatherFailure.invalidProviderData,
      );
      expect(provider.readings, isEmpty);
    });

    test('searches through the provider', () async {
      provider.places = const [queenstown];

      expect(await lookup.searchPlaces('queen'), const [queenstown]);
      expect(provider.searches, ['queen']);
    });
  });
}

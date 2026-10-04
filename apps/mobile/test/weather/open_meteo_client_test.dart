import 'dart:async';
import 'dart:convert';

import 'package:dayli_mobile/weather/coordinates.dart';
import 'package:dayli_mobile/weather/open_meteo_client.dart';
import 'package:dayli_mobile/weather/post_weather.dart';
import 'package:dayli_mobile/weather/weather_failure.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const auckland = Coordinates(-36.848461, 174.763336);

http.Response json(Object? body, [int status = 200]) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

Map<String, Object?> forecast({
  Object? temperature = 11.6,
  Object? code = 61,
}) => {
  'current': {'temperature_2m': temperature, 'weather_code': code},
};

Future<WeatherFailure> failureOf(Future<Object?> Function() action) async {
  try {
    await action();
  } on WeatherException catch (error) {
    return error.failure;
  }
  throw StateError('expected a WeatherException');
}

void main() {
  group('current weather', () {
    test('asks for the neighbourhood, never the exact position', () async {
      late http.BaseRequest seen;
      final client = OpenMeteoClient(
        client: MockClient((request) async {
          seen = request;
          return json(forecast());
        }),
      );

      final reading = await client.currentWeather(auckland);

      expect(seen.url.host, 'api.open-meteo.com');
      expect(seen.url.path, '/v1/forecast');
      expect(seen.url.queryParameters, {
        'latitude': '-36.85',
        'longitude': '174.76',
        'current': 'temperature_2m,weather_code',
        'temperature_unit': 'celsius',
      });
      expect(seen.method, 'GET');
      expect(seen.headers.containsKey('authorization'), isFalse);
      expect(seen.headers.containsKey('cookie'), isFalse);
      expect(reading.condition, WeatherCondition.rain);
      expect(reading.temperatureC, 12);
    });

    test('rounds the temperature to a whole degree', () async {
      Future<int> read(num temperature) async {
        final client = OpenMeteoClient(
          client: MockClient(
            (_) async => json(forecast(temperature: temperature)),
          ),
        );
        return (await client.currentWeather(auckland)).temperatureC;
      }

      expect(await read(11.4), 11);
      expect(await read(11.5), 12);
      expect(await read(-3.5), -4);
      expect(await read(-0.4), 0);
      expect(await read(18), 18);
      expect(await read(-90), -90);
      expect(await read(60), 60);
    });

    test('reads a whole-number weather code sent as a decimal', () async {
      final client = OpenMeteoClient(
        client: MockClient((_) async => json(forecast(code: 3.0))),
      );

      expect(
        (await client.currentWeather(auckland)).condition,
        WeatherCondition.cloudy,
      );
    });

    test('does not ask about a position that is not on Earth', () async {
      var asked = false;
      final client = OpenMeteoClient(
        client: MockClient((_) async {
          asked = true;
          return json(forecast());
        }),
      );

      for (final bad in [
        const Coordinates(95, 0),
        const Coordinates(0, 200),
        const Coordinates(double.nan, 0),
      ]) {
        expect(
          await failureOf(() => client.currentWeather(bad)),
          WeatherFailure.invalidProviderData,
        );
      }
      expect(asked, isFalse);
    });

    test('rejects an answer it cannot trust', () async {
      for (final body in <Object?>[
        null,
        'rain',
        [forecast()],
        <String, Object?>{},
        {'current': null},
        {'current': 'warm'},
        {'current': <String, Object?>{}},
        {
          'current': {'temperature_2m': 11},
        },
        {
          'current': {'weather_code': 61},
        },
        forecast(temperature: '11'),
        forecast(temperature: null),
        forecast(temperature: 61),
        forecast(temperature: 60.6),
        forecast(temperature: -91),
        forecast(temperature: 1e9),
        forecast(code: '61'),
        forecast(code: null),
        forecast(code: 4),
        forecast(code: 100),
        forecast(code: -1),
        forecast(code: 3.5),
      ]) {
        final client = OpenMeteoClient(
          client: MockClient((_) async => json(body)),
        );

        expect(
          await failureOf(() => client.currentWeather(auckland)),
          WeatherFailure.invalidProviderData,
          reason: '$body',
        );
      }
    });

    test('rejects a body that is not JSON', () async {
      final client = OpenMeteoClient(
        client: MockClient((_) async => http.Response('<html>', 200)),
      );

      expect(
        await failureOf(() => client.currentWeather(auckland)),
        WeatherFailure.invalidProviderData,
      );
    });

    test('reports a provider error status as unavailable', () async {
      for (final status in [400, 404, 429, 500, 503]) {
        final client = OpenMeteoClient(
          client: MockClient((_) async => json({'error': true}, status)),
        );

        expect(
          await failureOf(() => client.currentWeather(auckland)),
          WeatherFailure.providerUnavailable,
          reason: '$status',
        );
      }
    });

    test('reports a lost connection as offline', () async {
      final client = OpenMeteoClient(
        client: MockClient((_) async => throw http.ClientException('no route')),
      );

      expect(
        await failureOf(() => client.currentWeather(auckland)),
        WeatherFailure.offline,
      );
    });

    test('gives up on a provider that never answers', () async {
      final client = OpenMeteoClient(
        timeout: const Duration(milliseconds: 20),
        client: MockClient((_) => Completer<http.Response>().future),
      );

      expect(
        await failureOf(() => client.currentWeather(auckland)),
        WeatherFailure.providerTimedOut,
      );
    });

    test('abandons an oversized body while it is still arriving', () async {
      var chunksSent = 0;
      final client = OpenMeteoClient(
        client: MockClient.streaming((request, _) async {
          Stream<List<int>> body() async* {
            for (var i = 0; i < 1000; i++) {
              chunksSent++;
              yield List.filled(1024, 0x20);
            }
          }

          return http.StreamedResponse(body(), 200);
        }),
      );

      expect(
        await failureOf(() => client.currentWeather(auckland)),
        WeatherFailure.invalidProviderData,
      );
      expect(chunksSent, lessThan(100));
    });

    test('never puts the position in a failure', () async {
      final failures = <WeatherException>[];
      for (final handler in <Future<http.Response> Function(http.Request)>[
        (request) async =>
            throw http.ClientException('failed for ${request.url}'),
        (_) async => json({'error': true}, 500),
        (_) async => http.Response('nope', 200),
        (_) async => json(forecast(code: 4)),
      ]) {
        try {
          await OpenMeteoClient(
            client: MockClient(handler),
          ).currentWeather(auckland);
        } on WeatherException catch (error) {
          failures.add(error);
        }
      }

      expect(failures, hasLength(4));
      for (final failure in failures) {
        expect('$failure', isNot(contains('36')));
        expect('$failure', isNot(contains('174')));
        expect('$failure', isNot(contains('open-meteo')));
      }
    });
  });

  group('place search', () {
    Map<String, Object?> place(
      String name, {
      Object? latitude = -36.848461,
      Object? longitude = 174.763336,
      String? admin1,
      String? country,
    }) => {
      'name': name,
      'latitude': latitude,
      'longitude': longitude,
      'admin1': ?admin1,
      'country': ?country,
    };

    OpenMeteoClient clientReturning(
      Object? body, {
      void Function(http.BaseRequest)? onRequest,
    }) => OpenMeteoClient(
      client: MockClient((request) async {
        onRequest?.call(request);
        return json(body);
      }),
    );

    test('does not search for fewer than two characters', () async {
      var asked = false;
      final client = clientReturning({
        'results': [],
      }, onRequest: (_) => asked = true);

      expect(await client.searchPlaces(''), isEmpty);
      expect(await client.searchPlaces(' a '), isEmpty);
      expect(asked, isFalse);
    });

    test('sends the trimmed, length-capped query and nothing else', () async {
      late http.BaseRequest seen;
      final client = clientReturning({}, onRequest: (r) => seen = r);

      await client.searchPlaces('  Auckland  ');
      expect(seen.url.host, 'geocoding-api.open-meteo.com');
      expect(seen.url.path, '/v1/search');
      expect(seen.url.queryParameters, {
        'name': 'Auckland',
        'count': '8',
        'language': 'en',
        'format': 'json',
      });

      await client.searchPlaces('x' * 200);
      expect(seen.url.queryParameters['name'], 'x' * 80);
    });

    test('returns matches with a label that tells places apart', () async {
      final client = clientReturning({
        'results': [
          place('Auckland', admin1: 'Auckland', country: 'New Zealand'),
          place(
            'Auckland',
            admin1: 'California',
            country: 'United States',
            latitude: 38.5,
            longitude: -121.5,
          ),
        ],
      });

      final places = await client.searchPlaces('Auckland');

      expect(places.map((p) => p.name), ['Auckland', 'Auckland']);
      expect(places.map((p) => p.label), [
        'Auckland, New Zealand',
        'Auckland, California, United States',
      ]);
      // Only the neighbourhood is kept.
      expect(places.first.coordinates.latitude, -36.85);
      expect(places.first.coordinates.longitude, 174.76);
    });

    test('returns nothing when the provider has no results', () async {
      expect(await clientReturning({}).searchPlaces('Nowhereville'), isEmpty);
      expect(
        await clientReturning({'results': []}).searchPlaces('Nowhereville'),
        isEmpty,
      );
    });

    test('drops the entries it cannot trust and keeps the rest', () async {
      final client = clientReturning({
        'results': [
          place('Good'),
          place('NoLatitude', latitude: null),
          place('BadLatitude', latitude: 91),
          place('BadLongitude', longitude: 181),
          place('TextLatitude', latitude: '12'),
          place('\u0007\u0085'),
          place('   '),
          'junk',
          null,
          {'latitude': 1, 'longitude': 1},
          place('Also good'),
        ],
      });

      expect((await client.searchPlaces('good')).map((p) => p.name), [
        'Good',
        'Also good',
      ]);
    });

    test('cleans names and caps the list', () async {
      final client = clientReturning({
        'results': [
          place('  Queen\ntown  ', country: 'New\u0000 Zealand'),
          for (var i = 0; i < 20; i++) place('Place $i'),
        ],
      });

      final places = await client.searchPlaces('queen');

      expect(places, hasLength(8));
      expect(places.first.name, 'Queen town');
      expect(places.first.label, 'Queen town, New Zealand');
      for (final p in places) {
        expect(PostWeather.isValidPlaceName(p.name), isTrue);
      }
    });

    test('rejects an answer that is not the expected shape', () async {
      for (final body in <Object?>[
        null,
        'x',
        [1],
        {'results': 'x'},
        {'results': 5},
      ]) {
        expect(
          await failureOf(() => clientReturning(body).searchPlaces('Auckland')),
          WeatherFailure.invalidProviderData,
          reason: '$body',
        );
      }
    });

    test('reports provider and connection failures', () async {
      expect(
        await failureOf(
          () => OpenMeteoClient(
            client: MockClient((_) async => json({}, 500)),
          ).searchPlaces('Auckland'),
        ),
        WeatherFailure.providerUnavailable,
      );
      expect(
        await failureOf(
          () => OpenMeteoClient(
            client: MockClient((_) async => throw http.ClientException('x')),
          ).searchPlaces('Auckland'),
        ),
        WeatherFailure.offline,
      );
      expect(
        await failureOf(
          () => OpenMeteoClient(
            timeout: const Duration(milliseconds: 20),
            client: MockClient((_) => Completer<http.Response>().future),
          ).searchPlaces('Auckland'),
        ),
        WeatherFailure.providerTimedOut,
      );
    });
  });
}

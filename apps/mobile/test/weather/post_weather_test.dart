import 'package:dayli_mobile/weather/coordinates.dart';
import 'package:dayli_mobile/weather/post_weather.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('WeatherCondition', () {
    test('maps every standard WMO code and nothing else', () {
      const expected = <int, WeatherCondition>{
        0: WeatherCondition.clear,
        1: WeatherCondition.clear,
        2: WeatherCondition.partlyCloudy,
        3: WeatherCondition.cloudy,
        45: WeatherCondition.fog,
        48: WeatherCondition.fog,
        51: WeatherCondition.drizzle,
        53: WeatherCondition.drizzle,
        55: WeatherCondition.drizzle,
        56: WeatherCondition.drizzle,
        57: WeatherCondition.drizzle,
        61: WeatherCondition.rain,
        63: WeatherCondition.rain,
        65: WeatherCondition.rain,
        66: WeatherCondition.rain,
        67: WeatherCondition.rain,
        71: WeatherCondition.snow,
        73: WeatherCondition.snow,
        75: WeatherCondition.snow,
        77: WeatherCondition.snow,
        80: WeatherCondition.rain,
        81: WeatherCondition.rain,
        82: WeatherCondition.rain,
        85: WeatherCondition.snow,
        86: WeatherCondition.snow,
        95: WeatherCondition.thunderstorm,
        96: WeatherCondition.thunderstorm,
        99: WeatherCondition.thunderstorm,
      };
      for (var code = -5; code <= 120; code++) {
        expect(
          WeatherCondition.fromWmoCode(code),
          expected[code],
          reason: 'code $code',
        );
      }
    });

    test('round trips through its wire value and rejects unknown ones', () {
      for (final condition in WeatherCondition.values) {
        expect(WeatherCondition.fromWire(condition.wireValue), condition);
      }
      expect(WeatherCondition.fromWire('hail'), isNull);
      expect(WeatherCondition.fromWire('Rain'), isNull);
      expect(WeatherCondition.fromWire(null), isNull);
      expect(WeatherCondition.fromWire(3), isNull);
    });

    test('uses the wire values the API accepts', () {
      expect(WeatherCondition.values.map((c) => c.wireValue), [
        'clear',
        'partly_cloudy',
        'cloudy',
        'fog',
        'drizzle',
        'rain',
        'snow',
        'thunderstorm',
      ]);
    });
  });

  group('place names', () {
    test('accepts the names the API accepts', () {
      expect(PostWeather.isValidPlaceName('Auckland'), isTrue);
      expect(PostWeather.isValidPlaceName('a' * 80), isTrue);
      expect(PostWeather.isValidPlaceName('🌧' * 80), isTrue);
      expect(PostWeather.isValidPlaceName('Hāwera'), isTrue);
    });

    test('rejects the names the API rejects', () {
      for (final bad in [
        '',
        ' ',
        ' Auckland',
        'Auckland ',
        'a' * 81,
        '🌧' * 81,
        'Auck\nland',
        'Auck\tland',
        'Auck\u0007land',
        'Auck\u007fland',
        'Auck\u0085land',
      ]) {
        expect(PostWeather.isValidPlaceName(bad), isFalse, reason: bad);
      }
    });

    test('cleans provider text into a valid name', () {
      expect(PostWeather.cleanPlaceName('  Auckland  '), 'Auckland');
      expect(PostWeather.cleanPlaceName('Auck\nland'), 'Auck land');
      expect(PostWeather.cleanPlaceName('Auck\u0007land'), 'Auckland');
      expect(PostWeather.cleanPlaceName('New   York\tCity'), 'New York City');
      expect(PostWeather.cleanPlaceName('A\u0085B'), 'A B');
      expect(PostWeather.cleanPlaceName(''), isNull);
      expect(PostWeather.cleanPlaceName('   '), isNull);
      expect(PostWeather.cleanPlaceName('\u0007\u0085'), isNull);
      expect(PostWeather.cleanPlaceName(null), isNull);
    });

    test('cuts a long name at a whole character without leaving a space', () {
      final emoji = PostWeather.cleanPlaceName('🌧' * 100)!;
      expect(emoji.runes.length, 80);
      final spaced = PostWeather.cleanPlaceName('${'a' * 79} bbbb')!;
      expect(spaced, 'a' * 79);
      expect(PostWeather.isValidPlaceName(spaced), isTrue);
    });

    test('whatever it cleans is a valid name', () {
      for (final raw in [
        'Queenstown',
        ' \n Queen\u0000stown \t',
        '🌧 Rainy ${'x' * 200}',
        'Z Y',
      ]) {
        final cleaned = PostWeather.cleanPlaceName(raw);
        expect(cleaned, isNotNull, reason: raw);
        expect(PostWeather.isValidPlaceName(cleaned!), isTrue, reason: raw);
      }
    });
  });

  group('PostWeather', () {
    const weather = PostWeather(
      condition: WeatherCondition.snow,
      temperatureC: -3,
      placeName: 'Queenstown',
    );

    test('round trips through JSON', () {
      expect(PostWeather.tryParse(weather.toJson()), weather);
      expect(weather.toJson(), {
        'condition': 'snow',
        'temperatureC': -3,
        'placeName': 'Queenstown',
      });
    });

    test('accepts the temperature limits', () {
      for (final t in [
        PostWeather.temperatureMinC,
        0,
        PostWeather.temperatureMaxC,
      ]) {
        expect(
          PostWeather.tryParse({...weather.toJson(), 'temperatureC': t}),
          isNotNull,
          reason: '$t',
        );
      }
    });

    test('rejects anything that is not a complete valid snapshot', () {
      final good = weather.toJson();
      for (final bad in <Object?>[
        null,
        'rain',
        [good],
        <String, Object?>{},
        {...good, 'condition': 'hail'},
        {...good, 'condition': null},
        {...good, 'temperatureC': 61},
        {...good, 'temperatureC': -91},
        {...good, 'temperatureC': 18.5},
        {...good, 'temperatureC': '18'},
        {...good, 'temperatureC': null},
        {...good, 'placeName': ''},
        {...good, 'placeName': ' Queenstown'},
        {...good, 'placeName': 'a' * 81},
        {...good, 'placeName': 'Queen\nstown'},
        {...good, 'placeName': 12},
        {...good}..remove('placeName'),
        {...good}..remove('condition'),
      ]) {
        expect(PostWeather.tryParse(bad), isNull, reason: '$bad');
      }
    });

    test('ignores extra keys such as coordinates', () {
      final parsed = PostWeather.tryParse({
        ...weather.toJson(),
        'latitude': -45.03,
        'longitude': 168.66,
      });

      expect(parsed, weather);
      expect(parsed!.toJson().keys, ['condition', 'temperatureC', 'placeName']);
    });

    test('compares by value and keeps the place out of its description', () {
      expect(
        weather,
        const PostWeather(
          condition: WeatherCondition.snow,
          temperatureC: -3,
          placeName: 'Queenstown',
        ),
      );
      expect(weather.hashCode, weather.hashCode);
      expect(weather.toString(), isNot(contains('Queenstown')));
    });
  });

  group('Coordinates', () {
    test('knows a position on Earth from one that is not', () {
      expect(const Coordinates(-36.85, 174.76).isValid, isTrue);
      expect(const Coordinates(90, 180).isValid, isTrue);
      expect(const Coordinates(-90, -180).isValid, isTrue);
      for (final bad in [
        const Coordinates(91, 0),
        const Coordinates(-91, 0),
        const Coordinates(0, 181),
        const Coordinates(0, -181),
        const Coordinates(double.nan, 0),
        const Coordinates(0, double.infinity),
      ]) {
        expect(bad.isValid, isFalse);
      }
    });

    test('cuts a position to about a kilometre', () {
      final approximate = const Coordinates(-36.848461, 174.763336).approximate;

      expect(approximate.latitude, -36.85);
      expect(approximate.longitude, 174.76);
      expect(approximate.approximate, approximate);
    });

    test('never prints the position', () {
      const coordinates = Coordinates(-36.848461, 174.763336);

      expect('$coordinates', isNot(contains('36')));
      expect('$coordinates', isNot(contains('174')));
    });
  });
}

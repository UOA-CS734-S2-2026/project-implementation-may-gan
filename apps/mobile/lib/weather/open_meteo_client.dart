import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'coordinates.dart';
import 'post_weather.dart';
import 'weather_failure.dart';
import 'weather_provider.dart';

/// Reads current weather and searches places through Open-Meteo, which needs
/// no API key. Its free tier is for non-commercial use and asks for
/// attribution, which the app shows next to the weather it adds.
///
/// Every answer is checked before it is used: a temperature must be a finite
/// number in range, a weather code must be one the standard table defines, and
/// a place needs a clean name and a position on Earth. Anything else is
/// `invalidProviderData`, never a guess. The positions it is asked about are
/// cut to about a kilometre first, and no error or log line carries a request
/// address, because that address holds the position.
class OpenMeteoClient implements WeatherProvider {
  OpenMeteoClient({
    http.Client? client,
    this.timeout = const Duration(seconds: 8),
  }) : _client = client ?? http.Client();

  final http.Client _client;
  final Duration timeout;

  static const forecastHost = 'api.open-meteo.com';
  static const geocodingHost = 'geocoding-api.open-meteo.com';

  /// Far larger than any real answer. A body past this is abandoned while it
  /// is still arriving, so a misbehaving server cannot make the app read an
  /// unbounded one.
  static const maxResponseBytes = 64 * 1024;

  static const minQueryLength = 2;
  static const maxQueryLength = 80;
  static const maxPlaces = 8;

  @override
  Future<WeatherReading> currentWeather(Coordinates coordinates) async {
    if (!coordinates.isValid) {
      throw const WeatherException(WeatherFailure.invalidProviderData);
    }
    final approximate = coordinates.approximate;
    final body = await _get(
      Uri.https(forecastHost, '/v1/forecast', {
        'latitude': approximate.latitude.toString(),
        'longitude': approximate.longitude.toString(),
        'current': 'temperature_2m,weather_code',
        'temperature_unit': 'celsius',
      }),
    );
    final current = body is Map<String, Object?> ? body['current'] : null;
    if (current is! Map<String, Object?>) {
      throw const WeatherException(WeatherFailure.invalidProviderData);
    }
    final temperature = current['temperature_2m'];
    final code = current['weather_code'];
    if (temperature is! num ||
        !temperature.isFinite ||
        code is! num ||
        !code.isFinite ||
        code != code.truncate()) {
      throw const WeatherException(WeatherFailure.invalidProviderData);
    }
    final rounded = temperature.round();
    final condition = WeatherCondition.fromWmoCode(code.toInt());
    if (condition == null || !PostWeather.isValidTemperature(rounded)) {
      throw const WeatherException(WeatherFailure.invalidProviderData);
    }
    // Rounding -0.4 gives -0, which is the same number but prints oddly.
    return WeatherReading(
      condition: condition,
      temperatureC: rounded == 0 ? 0 : rounded,
    );
  }

  @override
  Future<List<PlaceMatch>> searchPlaces(String query) async {
    final trimmed = query.trim();
    if (trimmed.runes.length < minQueryLength) return const [];
    final capped = trimmed.runes.length > maxQueryLength
        ? String.fromCharCodes(trimmed.runes.take(maxQueryLength))
        : trimmed;
    final body = await _get(
      Uri.https(geocodingHost, '/v1/search', {
        'name': capped,
        'count': '$maxPlaces',
        'language': 'en',
        'format': 'json',
      }),
    );
    if (body is! Map<String, Object?>) {
      throw const WeatherException(WeatherFailure.invalidProviderData);
    }
    // The key is absent when nothing matches.
    final results = body['results'];
    if (results == null) return const [];
    if (results is! List) {
      throw const WeatherException(WeatherFailure.invalidProviderData);
    }
    final places = <PlaceMatch>[];
    for (final result in results) {
      final place = _parsePlace(result);
      if (place != null) places.add(place);
      if (places.length == maxPlaces) break;
    }
    return places;
  }

  PlaceMatch? _parsePlace(Object? result) {
    if (result is! Map<String, Object?>) return null;
    final name = result['name'];
    final latitude = result['latitude'];
    final longitude = result['longitude'];
    if (name is! String || latitude is! num || longitude is! num) return null;
    final coordinates = Coordinates(latitude.toDouble(), longitude.toDouble());
    final cleaned = PostWeather.cleanPlaceName(name);
    if (cleaned == null || !coordinates.isValid) return null;
    final parts = <String>[cleaned];
    for (final key in const ['admin1', 'country']) {
      final value = PostWeather.cleanPlaceName(
        result[key] is String ? result[key] as String : null,
      );
      if (value != null && !parts.contains(value)) parts.add(value);
    }
    return PlaceMatch(
      name: cleaned,
      label: parts.join(', '),
      coordinates: coordinates.approximate,
    );
  }

  Future<Object?> _get(Uri uri) async {
    final List<int> bytes;
    try {
      bytes = await _read(uri).timeout(timeout);
    } on TimeoutException {
      throw const WeatherException(WeatherFailure.providerTimedOut);
    } on WeatherException {
      rethrow;
    } catch (_) {
      // Whatever the transport raised can include the address, which holds
      // the position, so none of it is kept.
      throw const WeatherException(WeatherFailure.offline);
    }
    try {
      return jsonDecode(utf8.decode(bytes));
    } on FormatException {
      throw const WeatherException(WeatherFailure.invalidProviderData);
    }
  }

  /// The body of a 200 answer, read as it arrives and abandoned as soon as it
  /// passes [maxResponseBytes].
  Future<List<int>> _read(Uri uri) async {
    final request = http.Request('GET', uri)
      ..headers['accept'] = 'application/json';
    final response = await _client.send(request);
    if (response.statusCode != 200) {
      throw const WeatherException(WeatherFailure.providerUnavailable);
    }
    final bytes = <int>[];
    await for (final chunk in response.stream) {
      bytes.addAll(chunk);
      if (bytes.length > maxResponseBytes) {
        throw const WeatherException(WeatherFailure.invalidProviderData);
      }
    }
    return bytes;
  }
}

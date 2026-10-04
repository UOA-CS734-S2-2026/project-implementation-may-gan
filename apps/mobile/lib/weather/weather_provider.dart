import 'coordinates.dart';
import 'post_weather.dart';

/// What a provider reports for one position.
class WeatherReading {
  const WeatherReading({required this.condition, required this.temperatureC});

  final WeatherCondition condition;
  final int temperatureC;
}

/// A place the author can choose by name. [name] is what a post stores;
/// [label] adds the region and country so two places with one name can be told
/// apart in the list. [coordinates] are only used to fetch the weather.
class PlaceMatch {
  const PlaceMatch({
    required this.name,
    required this.label,
    required this.coordinates,
  });

  final String name;
  final String label;
  final Coordinates coordinates;
}

/// Where weather and place names come from. Everything the app knows about a
/// provider goes through this, so the composer and its tests never touch the
/// network. Implementations throw a `WeatherException` and nothing else.
abstract interface class WeatherProvider {
  /// The current weather at [coordinates].
  Future<WeatherReading> currentWeather(Coordinates coordinates);

  /// Places whose name matches [query], best match first. Empty when the
  /// query is too short to search or nothing matches.
  Future<List<PlaceMatch>> searchPlaces(String query);
}

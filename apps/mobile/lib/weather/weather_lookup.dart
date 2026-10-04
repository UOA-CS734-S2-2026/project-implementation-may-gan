import 'coordinates.dart';
import 'open_meteo_client.dart';
import 'post_weather.dart';
import 'weather_failure.dart';
import 'weather_location.dart';
import 'weather_provider.dart';

/// What the composer needs to add weather to a post. Tests replace it.
class WeatherServices {
  const WeatherServices({
    this.createProvider = OpenMeteoClient.new,
    this.location = const DeviceLocationAccess(),
    this.placeNamer = const DevicePlaceNamer(),
  });

  /// A new provider for each composer.
  final WeatherProvider Function() createProvider;
  final LocationAccess location;
  final PlaceNamer placeNamer;
}

/// Makes a weather snapshot from the phone's location or from a place the
/// author chose. It never asks the system for permission: the composer does
/// that after explaining, and this only reports where permission stands.
class WeatherLookup {
  const WeatherLookup({
    required this.provider,
    required this.location,
    required this.placeNamer,
  });

  final WeatherProvider provider;
  final LocationAccess location;
  final PlaceNamer placeNamer;

  /// The weather where the phone is, named by its own geocoder. Throws a
  /// `WeatherException` saying why not.
  Future<PostWeather> atCurrentLocation() async {
    if (!await location.servicesEnabled()) {
      throw const WeatherException(WeatherFailure.servicesDisabled);
    }
    switch (await location.status()) {
      case LocationPermissionStatus.granted:
        break;
      case LocationPermissionStatus.askable:
        throw const WeatherException(WeatherFailure.permissionDenied);
      case LocationPermissionStatus.blocked:
        throw const WeatherException(WeatherFailure.permissionBlocked);
    }
    final Coordinates position = (await location.currentPosition()).approximate;
    // Both lookups start together: the weather and the name are independent.
    // A name lookup that fails counts as no name, and cannot surface as an
    // unhandled error if the weather lookup fails first.
    final reading = provider.currentWeather(position);
    final name = placeNamer
        .nameOf(position)
        .then<String?>((value) => value, onError: (Object _) => null);
    final weather = await reading;
    final placeName = await name;
    if (placeName == null || !PostWeather.isValidPlaceName(placeName)) {
      throw const WeatherException(WeatherFailure.placeNameUnavailable);
    }
    return _snapshot(weather, placeName);
  }

  /// The weather at a place the author picked from a search.
  Future<PostWeather> atPlace(PlaceMatch place) async {
    if (!PostWeather.isValidPlaceName(place.name)) {
      throw const WeatherException(WeatherFailure.invalidProviderData);
    }
    return _snapshot(
      await provider.currentWeather(place.coordinates),
      place.name,
    );
  }

  Future<List<PlaceMatch>> searchPlaces(String query) =>
      provider.searchPlaces(query);

  PostWeather _snapshot(WeatherReading reading, String placeName) =>
      PostWeather(
        condition: reading.condition,
        temperatureC: reading.temperatureC,
        placeName: placeName,
      );
}

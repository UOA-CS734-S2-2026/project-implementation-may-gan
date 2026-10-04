import 'dart:async';

import 'package:dayli_mobile/weather/coordinates.dart';
import 'package:dayli_mobile/weather/post_weather.dart';
import 'package:dayli_mobile/weather/weather_failure.dart';
import 'package:dayli_mobile/weather/weather_location.dart';
import 'package:dayli_mobile/weather/weather_provider.dart';

/// A provider that answers from a script and records what it was asked.
class FakeWeatherProvider implements WeatherProvider {
  FakeWeatherProvider({
    this.reading = const WeatherReading(
      condition: WeatherCondition.rain,
      temperatureC: 11,
    ),
    this.places = const [],
    this.failure,
  });

  WeatherReading reading;
  List<PlaceMatch> places;

  /// When set, every call throws it.
  WeatherFailure? failure;

  final List<Coordinates> readings = [];
  final List<String> searches = [];

  /// When set, a reading waits for this before it answers.
  Completer<void>? hold;

  @override
  Future<WeatherReading> currentWeather(Coordinates coordinates) async {
    readings.add(coordinates);
    await hold?.future;
    if (failure != null) throw WeatherException(failure!);
    return reading;
  }

  @override
  Future<List<PlaceMatch>> searchPlaces(String query) async {
    searches.add(query);
    if (failure != null) throw WeatherException(failure!);
    return places;
  }
}

/// Location that answers from a script. Counts how often it was asked for the
/// system prompt and for a position, so tests can show it was not.
class FakeLocationAccess implements LocationAccess {
  FakeLocationAccess({
    this.permission = LocationPermissionStatus.granted,
    this.services = true,
    this.position = const Coordinates(-36.848461, 174.763336),
    this.positionFailure,
    this.afterRequest,
  });

  LocationPermissionStatus permission;
  bool services;
  Coordinates position;
  WeatherFailure? positionFailure;

  /// What the system prompt leaves the permission as, when it is shown.
  LocationPermissionStatus? afterRequest;

  int requests = 0;
  int positions = 0;
  int settingsOpened = 0;
  int locationSettingsOpened = 0;

  @override
  Future<LocationPermissionStatus> status() async => permission;

  @override
  Future<LocationPermissionStatus> request() async {
    requests++;
    permission = afterRequest ?? permission;
    return permission;
  }

  @override
  Future<bool> servicesEnabled() async => services;

  @override
  Future<void> openSettings() async => settingsOpened++;

  @override
  Future<void> openLocationSettings() async => locationSettingsOpened++;

  @override
  Future<Coordinates> currentPosition() async {
    positions++;
    if (positionFailure != null) throw WeatherException(positionFailure!);
    return position;
  }
}

class FakePlaceNamer implements PlaceNamer {
  FakePlaceNamer({this.name = 'Auckland'});

  String? name;
  final List<Coordinates> asked = [];

  @override
  Future<String?> nameOf(Coordinates coordinates) async {
    asked.add(coordinates);
    return name;
  }
}

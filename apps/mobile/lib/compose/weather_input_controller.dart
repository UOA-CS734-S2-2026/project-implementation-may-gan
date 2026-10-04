import 'package:flutter/foundation.dart';

import '../weather/post_weather.dart';
import '../weather/weather_failure.dart';
import '../weather/weather_location.dart';
import '../weather/weather_lookup.dart';
import '../weather/weather_provider.dart';

/// Gets a weather snapshot for the composer. It owns only what is in flight
/// and why the last try failed; the snapshot itself lives in the draft, so it
/// is saved and restored with everything else.
///
/// Nothing here runs by itself. Each method is the author choosing something,
/// and the system's location prompt is only ever reached from
/// [useCurrentLocation], which the composer calls after explaining.
class WeatherInputController extends ChangeNotifier {
  WeatherInputController({required this.lookup, required this.onWeather});

  final WeatherLookup lookup;

  /// Receives a finished snapshot, to put in the draft.
  final void Function(PostWeather weather) onWeather;

  bool _working = false;
  WeatherFailure? _failure;
  int _generation = 0;
  bool _disposed = false;

  /// Whether a snapshot is being fetched.
  bool get isWorking => _working;

  /// Why the last attempt did not make a snapshot, or null.
  WeatherFailure? get failure => _failure;

  /// Whether only the app's page in Settings can fix [failure].
  bool get needsAppSettings => _failure == WeatherFailure.permissionBlocked;

  /// Whether only the device's location switch can fix [failure].
  bool get needsLocationSettings => _failure == WeatherFailure.servicesDisabled;

  /// Whether choosing a place is a way past [failure].
  bool get canChoosePlace => _failure != null;

  /// Weather where the phone is. Asks the system for permission only when it
  /// still can, and only here, after the author chose "Use my location".
  Future<void> useCurrentLocation() => _run(() async {
    final location = lookup.location;
    if (!await location.servicesEnabled()) {
      throw const WeatherException(WeatherFailure.servicesDisabled);
    }
    var status = await location.status();
    if (status == LocationPermissionStatus.askable) {
      status = await location.request();
    }
    switch (status) {
      case LocationPermissionStatus.granted:
        return lookup.atCurrentLocation();
      case LocationPermissionStatus.askable:
        throw const WeatherException(WeatherFailure.permissionDenied);
      case LocationPermissionStatus.blocked:
        throw const WeatherException(WeatherFailure.permissionBlocked);
    }
  });

  /// Weather at a place the author picked. Needs no permission.
  Future<void> usePlace(PlaceMatch place) => _run(() => lookup.atPlace(place));

  /// Places matching [query], for the author to pick from.
  Future<List<PlaceMatch>> searchPlaces(String query) =>
      lookup.searchPlaces(query);

  Future<void> openAppSettings() => lookup.location.openSettings();

  Future<void> openLocationSettings() => lookup.location.openLocationSettings();

  /// Gives up on a lookup in progress, so the author can post without waiting.
  /// A result that arrives afterwards is ignored.
  void cancel() {
    if (!_working) return;
    _generation++;
    _working = false;
    _failure = null;
    _notify();
  }

  /// Forgets the last failure, such as when the author leaves it be.
  void dismissFailure() {
    if (_failure == null) return;
    _failure = null;
    _notify();
  }

  Future<void> _run(Future<PostWeather> Function() fetch) async {
    if (_working) return;
    final generation = ++_generation;
    _working = true;
    _failure = null;
    _notify();
    try {
      final weather = await fetch();
      if (_stale(generation)) return;
      onWeather(weather);
    } on WeatherException catch (error) {
      if (_stale(generation)) return;
      _failure = error.failure;
    } catch (_) {
      // Anything unexpected is still just "couldn't get it", and carries no
      // details that could hold a position.
      if (_stale(generation)) return;
      _failure = WeatherFailure.locationUnavailable;
    } finally {
      if (!_stale(generation)) {
        _working = false;
        _notify();
      }
    }
  }

  bool _stale(int generation) => _disposed || generation != _generation;

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

import 'dart:async';

import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';

import 'coordinates.dart';
import 'post_weather.dart';
import 'weather_failure.dart';

/// Where the author's location permission stands.
enum LocationPermissionStatus {
  /// Not allowed yet, and the system will still ask. On iOS that is only ever
  /// true before the first prompt.
  askable,

  /// Refused with no way to ask again from inside the app, or restricted by
  /// the device. Only Settings can change it.
  blocked,

  /// Allowed.
  granted,
}

/// The phone's approximate location, apart from the phone so tests can script
/// it. The app only ever asks for a coarse, one-time position.
abstract interface class LocationAccess {
  Future<LocationPermissionStatus> status();

  /// Shows the system's own prompt. Call it only after the author has opted
  /// in, never at launch or when the composer opens.
  Future<LocationPermissionStatus> request();

  /// Whether location is switched on for the whole device.
  Future<bool> servicesEnabled();

  /// Opens this app's page in Settings, where location can be turned back on.
  Future<void> openSettings();

  /// Opens the device's location switch, for when location is off everywhere.
  Future<void> openLocationSettings();

  /// One approximate position. Throws a `WeatherException` when the phone
  /// cannot supply it. It never keeps listening: whichever way this ends, the
  /// phone's location request is stopped. [cancelled] completing ends it early.
  Future<Coordinates> currentPosition({Future<void>? cancelled});
}

class DeviceLocationAccess implements LocationAccess {
  const DeviceLocationAccess({
    this.timeout = const Duration(seconds: 12),
    this.maxFixAge = const Duration(minutes: 10),
    this.clock = DateTime.now,
  });

  /// How long to wait for a position before giving up.
  final Duration timeout;

  /// The oldest position worth using. iOS can hand over its last known
  /// location first, which may be hours old, so an older one is skipped.
  final Duration maxFixAge;
  final DateTime Function() clock;

  static LocationPermissionStatus _status(LocationPermission permission) =>
      switch (permission) {
        LocationPermission.whileInUse ||
        LocationPermission.always => LocationPermissionStatus.granted,
        LocationPermission.deniedForever => LocationPermissionStatus.blocked,
        LocationPermission.denied || LocationPermission.unableToDetermine =>
          LocationPermissionStatus.askable,
      };

  @override
  Future<LocationPermissionStatus> status() async =>
      _status(await Geolocator.checkPermission());

  @override
  Future<LocationPermissionStatus> request() async =>
      _status(await Geolocator.requestPermission());

  @override
  Future<bool> servicesEnabled() => Geolocator.isLocationServiceEnabled();

  @override
  Future<void> openSettings() async {
    await Geolocator.openAppSettings();
  }

  @override
  Future<void> openLocationSettings() async {
    await Geolocator.openLocationSettings();
  }

  @override
  Future<Coordinates> currentPosition({Future<void>? cancelled}) async {
    // A subscription, not `getCurrentPosition`: on iOS that call's time limit
    // only stops waiting, while the phone keeps looking for a fix. Cancelling
    // a subscription is what stops the phone's location request.
    final fix = Completer<Position>();
    void fail(Object error, [StackTrace? stack]) {
      if (!fix.isCompleted) fix.completeError(error, stack);
    }

    // Low accuracy asks for about a kilometre, which is all the weather
    // needs, and on Android is served by the coarse permission alone.
    final subscription =
        Geolocator.getPositionStream(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.low,
          ),
        ).listen(
          (position) {
            if (fix.isCompleted) return;
            if (clock().difference(position.timestamp) > maxFixAge) return;
            fix.complete(position);
          },
          onError: fail,
          onDone: () =>
              fail(const WeatherException(WeatherFailure.locationUnavailable)),
        );
    unawaited(
      cancelled?.then(
        (_) => fail(const WeatherException(WeatherFailure.locationUnavailable)),
      ),
    );
    try {
      final position = await fix.future.timeout(timeout);
      final coordinates = Coordinates(position.latitude, position.longitude);
      if (!coordinates.isValid) {
        throw const WeatherException(WeatherFailure.locationUnavailable);
      }
      return coordinates;
    } on WeatherException {
      rethrow;
    } on TimeoutException {
      throw const WeatherException(WeatherFailure.locationTimedOut);
    } on LocationServiceDisabledException {
      throw const WeatherException(WeatherFailure.servicesDisabled);
    } on PermissionDeniedException {
      throw const WeatherException(WeatherFailure.permissionDenied);
    } catch (_) {
      throw const WeatherException(WeatherFailure.locationUnavailable);
    } finally {
      await subscription.cancel();
    }
  }
}

/// Turns a position into the name of a place, using the phone's own geocoder
/// rather than a Dayli service. Android and iOS send the position to their
/// platform's place lookup to do this.
abstract interface class PlaceNamer {
  /// A clean place name for [coordinates], or null when the phone cannot say.
  Future<String?> nameOf(Coordinates coordinates);
}

class DevicePlaceNamer implements PlaceNamer {
  const DevicePlaceNamer({this.timeout = const Duration(seconds: 8)});

  final Duration timeout;

  @override
  Future<String?> nameOf(Coordinates coordinates) async {
    try {
      final placemarks = await Geocoding()
          .placemarkFromCoordinates(coordinates.latitude, coordinates.longitude)
          .timeout(timeout);
      // A city or town is as precise as a post should be: street names and
      // house numbers are never used.
      for (final placemark in placemarks) {
        for (final candidate in [
          placemark.locality,
          placemark.subAdministrativeArea,
          placemark.administrativeArea,
        ]) {
          final cleaned = PostWeather.cleanPlaceName(candidate);
          if (cleaned != null) return cleaned;
        }
      }
    } catch (_) {
      // No geocoder, no connection, or no result: the caller offers a search.
    }
    return null;
  }
}

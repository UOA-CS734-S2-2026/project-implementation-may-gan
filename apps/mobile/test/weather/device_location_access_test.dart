import 'dart:async';

import 'package:dayli_mobile/weather/coordinates.dart';
import 'package:dayli_mobile/weather/weather_failure.dart';
import 'package:dayli_mobile/weather/weather_location.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';

/// Stands in for the native side. It counts how many location requests are
/// open, which is what decides whether the phone keeps locating.
class FakeGeolocator extends GeolocatorPlatform
    with MockPlatformInterfaceMixin {
  int started = 0;
  int stopped = 0;
  int oneShotCalls = 0;

  /// Requests the phone is still working on.
  int get open => started - stopped;

  StreamController<Position> controller() {
    final c = StreamController<Position>(
      onListen: () => started++,
      onCancel: () => stopped++,
    );
    _current = c;
    return c;
  }

  late StreamController<Position> _current;

  @override
  Stream<Position> getPositionStream({LocationSettings? locationSettings}) =>
      _current.stream;

  @override
  Future<Position> getCurrentPosition({LocationSettings? locationSettings}) {
    // The one-shot call can't be stopped on iOS, so it must not be used.
    oneShotCalls++;
    return Completer<Position>().future;
  }

  void emit(Position position) => _current.add(position);

  void fail(Object error) => _current.addError(error);

  Future<void> close() => _current.close();
}

Position position({
  double latitude = -36.848461,
  double longitude = 174.763336,
  required DateTime at,
}) => Position(
  latitude: latitude,
  longitude: longitude,
  timestamp: at,
  accuracy: 1000,
  altitude: 0,
  altitudeAccuracy: 0,
  heading: 0,
  headingAccuracy: 0,
  speed: 0,
  speedAccuracy: 0,
);

void main() {
  final now = DateTime.utc(2026, 10, 4, 7, 0);
  late FakeGeolocator native;
  late GeolocatorPlatform original;

  DeviceLocationAccess access({
    Duration timeout = const Duration(milliseconds: 80),
  }) => DeviceLocationAccess(timeout: timeout, clock: () => now);

  setUp(() {
    original = GeolocatorPlatform.instance;
    native = FakeGeolocator();
    GeolocatorPlatform.instance = native;
    native.controller();
  });

  tearDown(() {
    GeolocatorPlatform.instance = original;
  });

  Future<WeatherFailure> failureOf(Future<Object?> pending) async {
    try {
      await pending;
    } on WeatherException catch (error) {
      return error.failure;
    }
    throw StateError('expected a WeatherException');
  }

  test('takes the first fix and then stops the phone locating', () async {
    final pending = access().currentPosition();
    await Future<void>.delayed(Duration.zero);
    expect(native.open, 1);

    native.emit(position(at: now));

    expect(await pending, const Coordinates(-36.848461, 174.763336));
    expect(native.open, 0);
    expect(native.oneShotCalls, 0);
  });

  test('stops the phone locating when the wait times out', () async {
    final pending = access().currentPosition();

    expect(await failureOf(pending), WeatherFailure.locationTimedOut);

    // The point: giving up waiting must also end the phone's request.
    expect(native.started, 1);
    expect(native.open, 0);
    expect(native.oneShotCalls, 0);
  });

  test('stops the phone locating when the author skips the weather', () async {
    final skipped = Completer<void>();
    final pending = access(
      timeout: const Duration(seconds: 5),
    ).currentPosition(cancelled: skipped.future);
    await Future<void>.delayed(Duration.zero);
    expect(native.open, 1);

    skipped.complete();

    expect(await failureOf(pending), WeatherFailure.locationUnavailable);
    expect(native.open, 0);
  });

  test('stops the phone locating when the composer is closed first', () async {
    // A signal that fired before the request started still ends it.
    final skipped = Completer<void>()..complete();
    final pending = access(
      timeout: const Duration(seconds: 5),
    ).currentPosition(cancelled: skipped.future);

    expect(await failureOf(pending), WeatherFailure.locationUnavailable);
    expect(native.open, 0);
  });

  test(
    'ignores a last known fix that is too old and waits for a fresh one',
    () async {
      final pending = access(
        timeout: const Duration(seconds: 5),
      ).currentPosition();
      await Future<void>.delayed(Duration.zero);

      native.emit(
        position(
          latitude: 51.5,
          longitude: -0.12,
          at: now.subtract(const Duration(hours: 5)),
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(native.open, 1, reason: 'still waiting for a fresh fix');

      native.emit(position(at: now.subtract(const Duration(minutes: 1))));

      final result = await pending;
      expect(result.latitude, -36.848461);
      expect(native.open, 0);
    },
  );

  test('takes a fix that is only a little old', () async {
    final pending = access().currentPosition();
    await Future<void>.delayed(Duration.zero);

    native.emit(position(at: now.subtract(const Duration(minutes: 9))));

    expect(await pending, isNotNull);
    expect(native.open, 0);
  });

  test('maps the plugin\'s errors and stops locating', () async {
    final denied = access().currentPosition();
    await Future<void>.delayed(Duration.zero);
    native.fail(const PermissionDeniedException('no'));
    expect(await failureOf(denied), WeatherFailure.permissionDenied);
    expect(native.open, 0);

    native.controller();
    final off = access().currentPosition();
    await Future<void>.delayed(Duration.zero);
    native.fail(const LocationServiceDisabledException());
    expect(await failureOf(off), WeatherFailure.servicesDisabled);
    expect(native.open, 0);

    native.controller();
    final broken = access().currentPosition();
    await Future<void>.delayed(Duration.zero);
    native.fail(StateError('native failure with detail'));
    expect(await failureOf(broken), WeatherFailure.locationUnavailable);
    expect(native.open, 0);
  });

  test('reports a location stream that ends without a fix', () async {
    final pending = access().currentPosition();
    await Future<void>.delayed(Duration.zero);

    await native.close();

    expect(await failureOf(pending), WeatherFailure.locationUnavailable);
  });

  test('refuses a position that is not on Earth and stops locating', () async {
    final pending = access().currentPosition();
    await Future<void>.delayed(Duration.zero);

    native.emit(position(latitude: 999, at: now));

    expect(await failureOf(pending), WeatherFailure.locationUnavailable);
    expect(native.open, 0);
  });

  test('keeps no request open across repeated attempts', () async {
    for (var i = 0; i < 3; i++) {
      native.controller();
      expect(
        await failureOf(access().currentPosition()),
        WeatherFailure.locationTimedOut,
      );
    }

    expect(native.started, 3);
    expect(native.open, 0);
  });
}

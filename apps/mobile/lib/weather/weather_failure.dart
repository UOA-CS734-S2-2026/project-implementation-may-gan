/// Why a weather snapshot could not be made. None of these carries a location
/// or a place, so a failure can be shown or reported without leaking either.
enum WeatherFailure {
  /// The author has not allowed location, and the system may ask again.
  permissionDenied,

  /// The author refused location and the system will not ask again, or the
  /// device restricts it. Only Settings can change this.
  permissionBlocked,

  /// Location is switched off for the whole device.
  servicesDisabled,

  /// The phone did not find its position in time.
  locationTimedOut,

  /// The phone could not find its position.
  locationUnavailable,

  /// The phone could not tell which place the position is in.
  placeNameUnavailable,

  /// No connection to the weather provider.
  offline,

  /// The weather provider took too long.
  providerTimedOut,

  /// The weather provider answered with an error.
  providerUnavailable,

  /// The weather provider answered with something this app cannot trust.
  invalidProviderData,
}

class WeatherException implements Exception {
  const WeatherException(this.failure);

  final WeatherFailure failure;

  @override
  String toString() => 'WeatherException(${failure.name})';
}

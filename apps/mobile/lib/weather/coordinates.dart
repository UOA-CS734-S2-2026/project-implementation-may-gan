/// A position, held in memory only to ask a provider about the weather there.
/// It is never stored, sent to Dayli, or logged, and it prints as a
/// placeholder so a stray string interpolation cannot leak it.
class Coordinates {
  const Coordinates(this.latitude, this.longitude);

  final double latitude;
  final double longitude;

  /// Whether this is a position on Earth.
  bool get isValid =>
      latitude.isFinite &&
      longitude.isFinite &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;

  /// The same position cut to two decimal places, about a kilometre. The
  /// weather does not change over a block, so a provider never learns more
  /// than the neighbourhood.
  Coordinates get approximate =>
      Coordinates(_round(latitude), _round(longitude));

  static double _round(double value) => (value * 100).round() / 100;

  @override
  bool operator ==(Object other) =>
      other is Coordinates &&
      other.latitude == latitude &&
      other.longitude == longitude;

  @override
  int get hashCode => Object.hash(latitude, longitude);

  @override
  String toString() => 'Coordinates(redacted)';
}

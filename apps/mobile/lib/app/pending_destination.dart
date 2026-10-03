/// Remembers where an outside link was going while the person signs in or
/// finishes username setup, so the router can open it afterwards.
///
/// It lives in memory only: it is never stored, logged, or kept across app
/// launches.
class PendingDestination {
  String? _location;

  void remember(String location) => _location = location;

  /// Returns the remembered location once, then forgets it.
  String? take() {
    final location = _location;
    _location = null;
    return location;
  }
}

/// The weather conditions a post can carry. The API accepts exactly these, so
/// a provider's finer distinctions are folded into them here.
enum WeatherCondition {
  clear('clear', 'Clear'),
  partlyCloudy('partly_cloudy', 'Partly cloudy'),
  cloudy('cloudy', 'Cloudy'),
  fog('fog', 'Fog'),
  drizzle('drizzle', 'Drizzle'),
  rain('rain', 'Rain'),
  snow('snow', 'Snow'),
  thunderstorm('thunderstorm', 'Thunderstorm');

  const WeatherCondition(this.wireValue, this.label);

  /// What the API sends and accepts.
  final String wireValue;

  /// What the author reads.
  final String label;

  /// Null when [value] is not a condition this build knows, so an unfamiliar
  /// value is dropped rather than shown as something else.
  static WeatherCondition? fromWire(Object? value) {
    for (final condition in values) {
      if (condition.wireValue == value) return condition;
    }
    return null;
  }

  /// Folds a WMO weather interpretation code, as Open-Meteo reports it, into a
  /// condition. Null for a code outside the standard table, which the caller
  /// treats as unusable provider data instead of guessing.
  static WeatherCondition? fromWmoCode(int code) => switch (code) {
    0 || 1 => clear,
    2 => partlyCloudy,
    3 => cloudy,
    45 || 48 => fog,
    51 || 53 || 55 || 56 || 57 => drizzle,
    61 || 63 || 65 || 66 || 67 || 80 || 81 || 82 => rain,
    71 || 73 || 75 || 77 || 85 || 86 => snow,
    95 || 96 || 99 => thunderstorm,
    _ => null,
  };
}

/// One weather snapshot: a condition, a whole-degree temperature in Celsius,
/// and the name of a place. It never holds coordinates.
///
/// The limits mirror the API's, so a snapshot that passes here is accepted
/// there. Anything read back from storage or from the server goes through
/// [tryParse], which applies them again.
class PostWeather {
  const PostWeather({
    required this.condition,
    required this.temperatureC,
    required this.placeName,
  });

  static const temperatureMinC = -90;
  static const temperatureMaxC = 60;
  static const placeNameMaxLength = 80;

  final WeatherCondition condition;
  final int temperatureC;
  final String placeName;

  /// Whether [value] is a place name the API accepts: trimmed, 1 to
  /// [placeNameMaxLength] characters (an emoji counts once), no control
  /// characters.
  static bool isValidPlaceName(String value) =>
      value.isNotEmpty &&
      value == value.trim() &&
      value.runes.length <= placeNameMaxLength &&
      !value.runes.any(_isControl);

  static bool isValidTemperature(int value) =>
      value >= temperatureMinC && value <= temperatureMaxC;

  /// Turns a provider's place name into one the API accepts, or null when
  /// nothing usable is left. Tabs and line breaks count as spaces, other
  /// control characters are removed, runs of whitespace become one space, and
  /// a name that is too long is cut at a whole character.
  static String? cleanPlaceName(String? raw) {
    if (raw == null) return null;
    final kept = String.fromCharCodes([
      for (final rune in raw.runes)
        if (_isLineWhitespace(rune)) 0x20 else if (!_isControl(rune)) rune,
    ]);
    var cleaned = kept.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (cleaned.runes.length > placeNameMaxLength) {
      cleaned = String.fromCharCodes(
        cleaned.runes.take(placeNameMaxLength),
      ).trim();
    }
    return cleaned.isEmpty ? null : cleaned;
  }

  /// Tab, line feed, vertical tab, form feed, carriage return and NEL.
  static bool _isLineWhitespace(int rune) =>
      (rune >= 0x09 && rune <= 0x0d) || rune == 0x85;

  /// C0, DEL and C1 control characters, which the API refuses in a place name.
  static bool _isControl(int rune) =>
      rune <= 0x1f || (rune >= 0x7f && rune <= 0x9f);

  /// Null unless [json] is a complete, valid snapshot. Used for a draft read
  /// from storage and a post read from the server, neither of which is
  /// trusted to be well formed.
  static PostWeather? tryParse(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final condition = WeatherCondition.fromWire(json['condition']);
    final temperature = json['temperatureC'];
    final place = json['placeName'];
    if (condition == null ||
        temperature is! int ||
        !isValidTemperature(temperature) ||
        place is! String ||
        !isValidPlaceName(place)) {
      return null;
    }
    return PostWeather(
      condition: condition,
      temperatureC: temperature,
      placeName: place,
    );
  }

  Map<String, Object?> toJson() => {
    'condition': condition.wireValue,
    'temperatureC': temperatureC,
    'placeName': placeName,
  };

  @override
  bool operator ==(Object other) =>
      other is PostWeather &&
      other.condition == condition &&
      other.temperatureC == temperatureC &&
      other.placeName == placeName;

  @override
  int get hashCode => Object.hash(condition, temperatureC, placeName);

  /// The place name is left out so a snapshot never lands in a log.
  @override
  String toString() => 'PostWeather(${condition.wireValue}, $temperatureC°C)';
}

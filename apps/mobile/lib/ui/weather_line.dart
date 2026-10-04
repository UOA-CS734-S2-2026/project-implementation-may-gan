import 'package:flutter/material.dart';

import '../app/theme.dart';
import '../weather/post_weather.dart';

IconData weatherIcon(WeatherCondition condition) => switch (condition) {
  WeatherCondition.clear => Icons.wb_sunny_rounded,
  WeatherCondition.partlyCloudy => Icons.wb_cloudy_outlined,
  WeatherCondition.cloudy => Icons.cloud_rounded,
  WeatherCondition.fog => Icons.foggy,
  WeatherCondition.drizzle => Icons.grain_rounded,
  WeatherCondition.rain => Icons.water_drop_rounded,
  WeatherCondition.snow => Icons.ac_unit_rounded,
  WeatherCondition.thunderstorm => Icons.thunderstorm_rounded,
};

/// How a snapshot reads, such as "Rain · 11°C · Auckland".
String weatherSummary(PostWeather weather) =>
    '${weather.condition.label} · ${weather.temperatureC}°C · '
    '${weather.placeName}';

/// What a screen reader says for a snapshot, with the unit spelled out.
String weatherSemanticsLabel(PostWeather weather) =>
    'Weather: ${weather.condition.label}, ${weather.temperatureC} degrees '
    'Celsius, ${weather.placeName}';

/// One quiet line for a post's weather: an icon and "Rain · 11°C · Auckland".
class WeatherLine extends StatelessWidget {
  const WeatherLine({super.key, required this.weather, this.style});

  final PostWeather weather;

  /// The text style, so the line sits in the same voice as its neighbours.
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final textStyle =
        style ??
        DayliText.sans(
          context,
          size: DayliTextSize.sm,
          color: colors.foregroundTertiary,
        );
    return Semantics(
      label: weatherSemanticsLabel(weather),
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            weatherIcon(weather.condition),
            size: 16,
            color: textStyle.color ?? colors.foregroundTertiary,
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              weatherSummary(weather),
              style: textStyle,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

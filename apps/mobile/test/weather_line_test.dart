import 'package:dayli_mobile/ui/weather_line.dart';
import 'package:dayli_mobile/weather/post_weather.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> pumpLine(WidgetTester tester, PostWeather weather) =>
    tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 220,
            child: WeatherLine(key: const Key('line'), weather: weather),
          ),
        ),
      ),
    );

void main() {
  testWidgets('shows every condition with its own label and icon', (
    tester,
  ) async {
    final icons = <IconData>{};
    for (final condition in WeatherCondition.values) {
      await pumpLine(
        tester,
        PostWeather(
          condition: condition,
          temperatureC: -3,
          placeName: 'Queenstown',
        ),
      );

      expect(
        find.text('${condition.label} · -3°C · Queenstown'),
        findsOneWidget,
        reason: condition.name,
      );
      icons.add(tester.widget<Icon>(find.byType(Icon)).icon!);
    }

    // No two conditions share an icon.
    expect(icons, hasLength(WeatherCondition.values.length));
  });

  testWidgets('says the unit aloud', (tester) async {
    final semantics = tester.ensureSemantics();
    await pumpLine(
      tester,
      const PostWeather(
        condition: WeatherCondition.partlyCloudy,
        temperatureC: 18,
        placeName: 'Wellington',
      ),
    );

    expect(
      find.bySemanticsLabel(
        'Weather: Partly cloudy, 18 degrees Celsius, Wellington',
      ),
      findsOneWidget,
    );
    semantics.dispose();
  });

  testWidgets('shortens a long place name instead of overflowing', (
    tester,
  ) async {
    await pumpLine(
      tester,
      PostWeather(
        condition: WeatherCondition.snow,
        temperatureC: -12,
        placeName: 'A' * 80,
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('line')), findsOneWidget);
  });
}

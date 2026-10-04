import 'dart:async';

import 'package:flutter/material.dart';

import '../app/theme.dart';
import '../ui/dayli_button.dart';
import '../ui/weather_line.dart';
import '../weather/post_weather.dart';
import '../weather/weather_failure.dart';
import '../weather/weather_provider.dart';
import 'weather_input_controller.dart';

/// A plain-language reason a weather snapshot could not be made, with what to
/// do next. None of these mention a position.
String weatherFailureMessage(WeatherFailure failure) => switch (failure) {
  WeatherFailure.permissionDenied =>
    "Dayli can't see where you are. You can choose a place instead.",
  WeatherFailure.permissionBlocked =>
    'Location is turned off for Dayli. You can turn it on in Settings, or '
        'choose a place instead.',
  WeatherFailure.servicesDisabled =>
    'Location is switched off on this phone. You can turn it on in Settings, '
        'or choose a place instead.',
  WeatherFailure.locationTimedOut || WeatherFailure.locationUnavailable =>
    "Couldn't find where you are. Try again, or choose a place instead.",
  WeatherFailure.placeNameUnavailable =>
    "Couldn't tell which place you're in. Choose a place instead.",
  WeatherFailure.offline => "You're offline. Try again when you're connected.",
  WeatherFailure.providerTimedOut || WeatherFailure.providerUnavailable =>
    "The weather service isn't responding. Try again in a moment.",
  WeatherFailure.invalidProviderData =>
    'The weather service sent something Dayli could not use. Try again, or '
        'leave the weather out.',
};

/// What the author picked in the explanation.
enum WeatherChoice { location, place }

/// The composer's weather: an optional row to add it, then the snapshot with a
/// way to remove it. Nothing is requested until the author taps, and the
/// author sees exactly what a post would carry before posting.
class WeatherInput extends StatelessWidget {
  const WeatherInput({
    super.key,
    required this.controller,
    required this.weather,
    required this.onAdd,
    required this.onRemove,
    required this.onChoosePlace,
  });

  final WeatherInputController controller;

  /// The draft's snapshot, or null.
  final PostWeather? weather;
  final VoidCallback onAdd;
  final VoidCallback onRemove;
  final VoidCallback onChoosePlace;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        if (controller.isWorking) return _Working(onCancel: controller.cancel);
        final current = weather;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (current != null)
              _WeatherCard(weather: current, onRemove: onRemove)
            else
              _AddRow(onPressed: onAdd),
            if (current == null && controller.failure != null)
              _Problem(
                controller: controller,
                onTryAgain: onAdd,
                onChoosePlace: onChoosePlace,
              ),
          ],
        );
      },
    );
  }
}

class _Working extends StatelessWidget {
  const _Working({required this.onCancel});

  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Container(
      key: const Key('composer.weather.working'),
      padding: const EdgeInsets.fromLTRB(16, 6, 6, 6),
      decoration: BoxDecoration(
        color: colors.backgroundSecondary,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              'Getting the weather…',
              style: DayliText.sans(context, size: DayliTextSize.base),
            ),
          ),
          // Posting waits for the weather, so this is the way to post without it.
          TextButton(
            key: const Key('composer.weather.cancel'),
            onPressed: onCancel,
            child: const Text('Skip'),
          ),
        ],
      ),
    );
  }
}

class _AddRow extends StatelessWidget {
  const _AddRow({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Semantics(
      button: true,
      label: 'Add the weather',
      excludeSemantics: true,
      child: Material(
        color: colors.backgroundSecondary,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          key: const Key('composer.weather.add'),
          borderRadius: BorderRadius.circular(18),
          onTap: onPressed,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: colors.accent,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.wb_sunny_rounded,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Add the weather',
                        style: DayliText.serif(
                          context,
                          size: DayliTextSize.base,
                          weight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        'Optional. Adds the weather, temperature and place, '
                        'like “Rain · 11°C · Auckland”.',
                        key: const Key('composer.weather.hint'),
                        style: DayliText.sans(
                          context,
                          size: DayliTextSize.sm,
                          color: colors.foregroundTertiary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _WeatherCard extends StatelessWidget {
  const _WeatherCard({required this.weather, required this.onRemove});

  final PostWeather weather;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Container(
      key: const Key('composer.weather.card'),
      padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
      decoration: BoxDecoration(
        color: colors.backgroundAccent,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Icon(weatherIcon(weather.condition), color: colors.accent, size: 28),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  weatherSummary(weather),
                  key: const Key('composer.weather.summary'),
                  style: DayliText.serif(
                    context,
                    size: DayliTextSize.base,
                    weight: FontWeight.w600,
                  ),
                ),
                Text(
                  'Weather from Open-Meteo.com. This goes on your post.',
                  style: DayliText.sans(
                    context,
                    size: DayliTextSize.sm,
                    color: colors.foregroundTertiary,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            key: const Key('composer.weather.remove'),
            tooltip: 'Remove the weather',
            onPressed: onRemove,
            icon: const Icon(Icons.close_rounded),
          ),
        ],
      ),
    );
  }
}

class _Problem extends StatelessWidget {
  const _Problem({
    required this.controller,
    required this.onTryAgain,
    required this.onChoosePlace,
  });

  final WeatherInputController controller;
  final VoidCallback onTryAgain;
  final VoidCallback onChoosePlace;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final failure = controller.failure!;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            weatherFailureMessage(failure),
            key: const Key('composer.weather.problem'),
            style: DayliText.sans(
              context,
              size: DayliTextSize.sm,
              color: colors.foregroundSecondary,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              if (controller.needsAppSettings)
                TextButton(
                  key: const Key('composer.weather.settings'),
                  onPressed: () => unawaited(controller.openAppSettings()),
                  child: const Text('Open Settings'),
                ),
              if (controller.needsLocationSettings)
                TextButton(
                  key: const Key('composer.weather.locationSettings'),
                  onPressed: () => unawaited(controller.openLocationSettings()),
                  child: const Text('Open location settings'),
                ),
              if (controller.canChoosePlace)
                TextButton(
                  key: const Key('composer.weather.choosePlace'),
                  onPressed: onChoosePlace,
                  child: const Text('Choose a place'),
                ),
              if (!controller.needsAppSettings &&
                  !controller.needsLocationSettings)
                TextButton(
                  key: const Key('composer.weather.retry'),
                  onPressed: onTryAgain,
                  child: const Text('Try again'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The explanation shown before the system's own location prompt. Choosing
/// "Use my location" is the opt-in; "Not now" costs nothing and the author can
/// add the weather another time.
Future<WeatherChoice?> showWeatherChoiceSheet(BuildContext context) {
  return showModalBottomSheet<WeatherChoice>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => const _ChoiceSheet(),
  );
}

class _ChoiceSheet extends StatelessWidget {
  const _ChoiceSheet();

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    Widget point(IconData icon, String text) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: colors.accent),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: DayliText.sans(context, size: DayliTextSize.base),
            ),
          ),
        ],
      ),
    );

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Add the weather to your post?',
              key: const Key('composer.weather.sheet.title'),
              style: DayliText.serif(
                context,
                fontSize: 24,
                weight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 16),
            point(
              Icons.my_location_rounded,
              'Dayli uses your approximate location once, only to find the '
              "weather. It isn't stored and isn't sent to Dayli.",
            ),
            point(
              Icons.visibility_outlined,
              'Only the weather, the temperature and the name of the place go '
              'on your post. You can see them and remove them before you post.',
            ),
            point(
              Icons.cloud_outlined,
              'The weather comes from Open-Meteo.com, and your phone looks up '
              'the name of the place.',
            ),
            const SizedBox(height: 8),
            DayliButton(
              key: const Key('composer.weather.sheet.location'),
              label: 'Use my location',
              weight: ButtonWeight.primary,
              fullWidth: true,
              height: 50,
              onPressed: () =>
                  Navigator.of(context).pop(WeatherChoice.location),
            ),
            const SizedBox(height: 10),
            DayliButton(
              key: const Key('composer.weather.sheet.place'),
              label: 'Choose a place instead',
              fullWidth: true,
              height: 50,
              onPressed: () => Navigator.of(context).pop(WeatherChoice.place),
            ),
            const SizedBox(height: 6),
            TextButton(
              key: const Key('composer.weather.sheet.decline'),
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Not now'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Lets the author search for a place by name and pick one. Returns the pick,
/// or null if they close it. Needs no location permission.
Future<PlaceMatch?> showPlaceSearchSheet(
  BuildContext context, {
  required Future<List<PlaceMatch>> Function(String query) search,
}) {
  return showModalBottomSheet<PlaceMatch>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => _PlaceSearchSheet(search: search),
  );
}

class _PlaceSearchSheet extends StatefulWidget {
  const _PlaceSearchSheet({required this.search});

  final Future<List<PlaceMatch>> Function(String query) search;

  @override
  State<_PlaceSearchSheet> createState() => _PlaceSearchSheetState();
}

class _PlaceSearchSheetState extends State<_PlaceSearchSheet> {
  static const _pause = Duration(milliseconds: 400);

  Timer? _timer;
  int _generation = 0;
  List<PlaceMatch> _results = const [];
  bool _searching = false;
  bool _searched = false;
  WeatherFailure? _failure;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _onChanged(String query) {
    _timer?.cancel();
    final generation = ++_generation;
    if (query.trim().length < 2) {
      setState(() {
        _results = const [];
        _searching = false;
        _searched = false;
        _failure = null;
      });
      return;
    }
    setState(() => _searching = true);
    _timer = Timer(_pause, () => unawaited(_run(query, generation)));
  }

  Future<void> _run(String query, int generation) async {
    List<PlaceMatch> results = const [];
    WeatherFailure? failure;
    try {
      results = await widget.search(query);
    } on WeatherException catch (error) {
      failure = error.failure;
    } catch (_) {
      failure = WeatherFailure.providerUnavailable;
    }
    if (!mounted || generation != _generation) return;
    setState(() {
      _results = results;
      _failure = failure;
      _searching = false;
      _searched = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: keyboard),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Choose a place',
                style: DayliText.serif(
                  context,
                  fontSize: 24,
                  weight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('composer.weather.search'),
                autofocus: true,
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'A city or town',
                  prefixIcon: Icon(Icons.search_rounded),
                ),
                onChanged: _onChanged,
              ),
              const SizedBox(height: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 320),
                child: _body(context, colors),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, DayliColors colors) {
    Widget note(String text, {Key? key}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Text(
        text,
        key: key,
        style: DayliText.sans(
          context,
          size: DayliTextSize.sm,
          color: colors.foregroundTertiary,
        ),
      ),
    );
    if (_searching) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    if (_failure != null) {
      return note(
        weatherFailureMessage(_failure!),
        key: const Key('composer.weather.search.problem'),
      );
    }
    if (_searched && _results.isEmpty) {
      return note('No places found.', key: const Key('composer.weather.empty'));
    }
    return ListView.builder(
      shrinkWrap: true,
      itemCount: _results.length,
      itemBuilder: (context, index) {
        final place = _results[index];
        return ListTile(
          key: Key('composer.weather.place.$index'),
          leading: const Icon(Icons.place_outlined),
          title: Text(place.label),
          onTap: () => Navigator.of(context).pop(place),
        );
      },
    );
  }
}

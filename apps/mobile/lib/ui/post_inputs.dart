import 'package:flutter/material.dart';

import '../app/theme.dart';
import '../compose/composer_controller.dart' show DailyPostLimits;
import '../drafts/daily_post_draft.dart' show PostAudience;

/// A 1–10 slider that starts unset, so a rating is always chosen on purpose.
/// The first tap or drag on the track sets it.
class RatingSlider extends StatelessWidget {
  const RatingSlider({
    super.key,
    required this.value,
    required this.onChanged,
    this.keyPrefix = 'composer',
  });

  final int? value;
  final ValueChanged<int> onChanged;

  /// Widget keys start with this, such as `composer.rating`.
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final rated = value != null;
    final ends = DayliText.sans(
      context,
      size: DayliTextSize.sm,
      color: colors.foregroundTertiary,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            trackHeight: 6,
            trackShape: _GradientSliderTrackShape(rated: rated),
            activeTrackColor: colors.backgroundTertiary,
            inactiveTrackColor: colors.backgroundTertiary,
            thumbColor: rated
                ? const Color(0xFF4F378B)
                : colors.foregroundTertiary,
            overlayColor: const Color(0xFF4F378B).withValues(alpha: 0.12),
            activeTickMarkColor: Colors.white.withValues(alpha: 0.6),
            inactiveTickMarkColor: colors.foregroundTertiary.withValues(
              alpha: 0.5,
            ),
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 12),
            overlayShape: const RoundSliderOverlayShape(overlayRadius: 24),
            showValueIndicator: ShowValueIndicator.never,
          ),
          child: Slider(
            key: Key('$keyPrefix.rating'),
            min: DailyPostLimits.ratingMin.toDouble(),
            max: DailyPostLimits.ratingMax.toDouble(),
            divisions: DailyPostLimits.ratingMax - DailyPostLimits.ratingMin,
            value: (value ?? DailyPostLimits.ratingMin).toDouble(),
            semanticFormatterCallback: (rating) =>
                rated ? '${rating.round()} out of 10' : 'Not rated yet',
            onChanged: (rating) => onChanged(rating.round()),
            onChangeEnd: (rating) => onChanged(rating.round()),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18),
          child: Row(
            children: [
              Text('1', style: ends),
              Expanded(
                child: rated
                    ? const SizedBox.shrink()
                    : Text(
                        'Slide to rate your day',
                        textAlign: TextAlign.center,
                        style: ends,
                      ),
              ),
              Text('10', style: ends),
            ],
          ),
        ),
      ],
    );
  }
}

/// Solo or friends, with nothing chosen until the author picks one.
class AudiencePicker extends StatelessWidget {
  const AudiencePicker({
    super.key,
    required this.value,
    required this.invalid,
    required this.onChanged,
    this.keyPrefix = 'composer',
  });

  final PostAudience? value;
  final bool invalid;
  final ValueChanged<PostAudience> onChanged;

  /// Widget keys start with this, such as `composer.audience.solo`.
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    Widget option(
      PostAudience audience,
      IconData icon,
      String title,
      String body,
    ) {
      final selected = value == audience;
      final isFriends = audience == PostAudience.friends;
      final activeBgColor = isFriends ? const Color(0xFFEADDFF) : const Color(0xFFFFDBCF);
      final activeFgColor = isFriends ? const Color(0xFF4F378B) : const Color(0xFF492500);

      return Expanded(
        child: Semantics(
          button: true,
          inMutuallyExclusiveGroup: true,
          selected: selected,
          label: '$title. $body',
          excludeSemantics: true,
          child: Material(
            color: selected
                ? activeBgColor
                : colors.backgroundSecondary,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(
                color: invalid ? colors.danger : Colors.transparent,
              ),
            ),
            child: InkWell(
              key: Key('$keyPrefix.audience.${audience.wireValue}'),
              borderRadius: BorderRadius.circular(14),
              onTap: () => onChanged(audience),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 88),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        icon,
                        size: 22,
                        color: selected ? activeFgColor : colors.foreground,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        title,
                        style: DayliText.serif(
                          context,
                          size: DayliTextSize.lg,
                          weight: FontWeight.w600,
                          color: selected ? activeFgColor : colors.foreground,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        body,
                        style: DayliText.sans(
                          context,
                          size: DayliTextSize.sm,
                          color: selected
                              ? activeFgColor.withValues(alpha: 0.85)
                              : colors.foregroundSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    // Both cards match the taller one's height.
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          option(
            PostAudience.friends,
            Icons.group_rounded,
            'Friends',
            'Your friends see it after midnight.',
          ),
          const SizedBox(width: 10),
          option(
            PostAudience.solo,
            Icons.lock_rounded,
            'Solo',
            'Only you can see it.',
          ),
        ],
      ),
    );
  }
}

class _GradientSliderTrackShape extends RoundedRectSliderTrackShape {
  const _GradientSliderTrackShape({required this.rated});
  final bool rated;

  @override
  void paint(
    PaintingContext context,
    Offset offset, {
    required RenderBox parentBox,
    required SliderThemeData sliderTheme,
    required Animation<double> enableAnimation,
    required TextDirection textDirection,
    required Offset thumbCenter,
    Offset? secondaryOffset,
    bool isDiscrete = false,
    bool isEnabled = false,
    double additionalActiveTrackHeight = 2,
  }) {
    final trackRect = getPreferredRect(
      parentBox: parentBox,
      offset: offset,
      sliderTheme: sliderTheme,
      isEnabled: isEnabled,
      isDiscrete: isDiscrete,
    );
    final activeTrackRect = Rect.fromLTRB(trackRect.left, trackRect.top, thumbCenter.dx, trackRect.bottom);
    final inactiveTrackRect = Rect.fromLTRB(thumbCenter.dx, trackRect.top, trackRect.right, trackRect.bottom);

    final Paint activePaint = Paint();
    if (rated) {
      activePaint.shader = const LinearGradient(
        colors: [Color(0xFFD0BCFF), Color(0xFF4F378B)],
      ).createShader(trackRect);
    } else {
      activePaint.color = sliderTheme.activeTrackColor!;
    }
    
    final Paint inactivePaint = Paint()..color = sliderTheme.inactiveTrackColor!;

    final Radius trackRadius = Radius.circular(trackRect.height / 2);
    
    context.canvas.drawRRect(
      RRect.fromRectAndCorners(
        activeTrackRect,
        topLeft: trackRadius,
        bottomLeft: trackRadius,
      ),
      activePaint,
    );

    context.canvas.drawRRect(
      RRect.fromRectAndCorners(
        inactiveTrackRect,
        topRight: trackRadius,
        bottomRight: trackRadius,
      ),
      inactivePaint,
    );
  }
}

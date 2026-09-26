import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../app/theme.dart';

/// WDCC's dotted paper background (`/dotgridbg.jpg` at 50% opacity).
/// [tilted] matches the auth and landing pages, which rotate it by 3°.
class DotGridBackground extends StatelessWidget {
  const DotGridBackground({super.key, this.tilted = false});

  final bool tilted;

  @override
  Widget build(BuildContext context) {
    final grid = Opacity(
      opacity: 0.5,
      child: Image.asset(
        'assets/wdcc/dotgridbg.jpg',
        repeat: ImageRepeat.repeat,
        fit: BoxFit.none,
        alignment: tilted ? const Alignment(-0.2, 0) : Alignment.center,
        filterQuality: FilterQuality.medium,
      ),
    );
    // Like WDCC's `inset-[-50%]`, the grid is twice the page size and centred
    // so the tilted version still covers every corner.
    return Positioned.fill(
      child: IgnorePointer(
        child: ClipRect(
          child: LayoutBuilder(
            builder: (context, box) => OverflowBox(
              minWidth: box.maxWidth * 2,
              maxWidth: box.maxWidth * 2,
              minHeight: box.maxHeight * 2,
              maxHeight: box.maxHeight * 2,
              child: tilted
                  ? Transform.rotate(angle: 3 * math.pi / 180, child: grid)
                  : grid,
            ),
          ),
        ),
      ),
    );
  }
}

/// A page on WDCC's background with the dot grid behind [child].
class DayliPage extends StatelessWidget {
  const DayliPage({super.key, required this.child, this.tilted = false});

  final Widget child;
  final bool tilted;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: DayliColors.of(context).background,
    child: Stack(
      children: [
        DotGridBackground(tilted: tilted),
        Positioned.fill(child: child),
      ],
    ),
  );
}

/// WDCC's white card: `bg-white shadow-card`, `rounded-2xl` by default.
class DayliCard extends StatelessWidget {
  const DayliCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(32),
    this.radius = 16,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: padding,
    decoration: BoxDecoration(
      color: DayliColors.of(context).card,
      borderRadius: BorderRadius.circular(radius),
      boxShadow: DayliShadows.card,
    ),
    child: child,
  );
}

/// The Dayli wordmark (`/dayli-logo.svg`).
class DayliLogo extends StatelessWidget {
  const DayliLogo({super.key, required this.width});

  final double width;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    'assets/wdcc/dayli-logo.svg',
    width: width,
    height: width * 71 / 138.67,
    fit: BoxFit.fill,
    semanticsLabel: 'Dayli logo',
  );
}

/// WDCC's 1.2px rule, optionally with a centred label (`pages`, `or`).
class DayliDivider extends StatelessWidget {
  const DayliDivider({
    super.key,
    this.label,
    this.thickness = 2.4,
    this.labelStyle,
  });

  final String? label;
  final double thickness;
  final TextStyle? labelStyle;

  @override
  Widget build(BuildContext context) {
    final line = Expanded(
      child: Container(
        height: thickness,
        color: DayliColors.of(context).foreground.withValues(alpha: 0.1),
      ),
    );
    final text = label;
    if (text == null) return Row(children: [line]);
    return Row(
      children: [
        line,
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(text, style: labelStyle ?? _labelStyle(context)),
        ),
        line,
      ],
    );
  }

  TextStyle _labelStyle(BuildContext context) => thickness > 1
      ? DayliText.serif(
          context,
          size: DayliTextSize.sm,
          weight: FontWeight.w600,
          color: DayliColors.of(context).foregroundTertiary,
        )
      : DayliText.serif(
          context,
          size: DayliTextSize.sm,
          color: DayliColors.of(context).foregroundTertiary,
        );
}

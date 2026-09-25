import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../app/theme.dart';

enum ButtonWeight { primary, secondary }

enum ButtonColor { accent, foreground }

enum ButtonSize { sm, md, lg }

const _arrowSvg =
    '<svg width="14" height="8" viewBox="0 0 14 8" xmlns="http://www.w3.org/2000/svg">'
    '<path d="M9.80564 0.516634C9.48539 0.205282 8.96054 0.214178 8.65809 0.534425C8.35563 0.854673 8.36453 1.35284 8.67588 1.66419L10.117 3.0964L1.55037 3.0964C1.10559 3.0964 0.749756 3.45224 0.749756 3.89702C0.749756 4.34181 1.10559 4.69764 1.55037 4.69764L10.0547 4.69764L8.6314 6.08538C8.31115 6.39673 8.30226 6.90379 8.61361 7.22404C8.92496 7.54429 9.43202 7.56208 9.76116 7.25073L12.8391 4.30623C13.0704 4.08383 13.0793 3.71021 12.8391 3.47892L9.80564 0.516634Z" fill="#000"/>'
    '</svg>';

/// WDCC's `Button`: rounded-xl, Spectral semibold, with an optional arrow.
class DayliButton extends StatelessWidget {
  const DayliButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.weight = ButtonWeight.secondary,
    this.color = ButtonColor.accent,
    this.size = ButtonSize.md,
    this.fullWidth = false,
    this.arrow = false,
    this.leading,
    this.alignStart = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final ButtonWeight weight;
  final ButtonColor color;
  final ButtonSize size;
  final bool fullWidth;
  final bool arrow;
  final Widget? leading;
  final bool alignStart;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final (background, foreground) = switch ((weight, color)) {
      (ButtonWeight.primary, ButtonColor.accent) => (
        colors.foregroundAccent,
        Colors.white,
      ),
      (ButtonWeight.secondary, ButtonColor.accent) => (
        colors.backgroundAccent,
        colors.foregroundAccent,
      ),
      (ButtonWeight.primary, ButtonColor.foreground) => (
        colors.foreground,
        Colors.white,
      ),
      (ButtonWeight.secondary, ButtonColor.foreground) => (
        colors.backgroundTertiary,
        colors.foreground,
      ),
    };
    final (textSize, padding) = switch (size) {
      ButtonSize.sm => (
        DayliTextSize.sm,
        const EdgeInsets.fromLTRB(16, 7, 16, 6),
      ),
      ButtonSize.md => (
        DayliTextSize.base,
        const EdgeInsets.fromLTRB(24, 8, 24, 7),
      ),
      ButtonSize.lg => (
        DayliTextSize.lg,
        const EdgeInsets.fromLTRB(24, 10, 24, 8),
      ),
    };

    final content = Row(
      mainAxisSize: fullWidth ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: alignStart
          ? MainAxisAlignment.start
          : MainAxisAlignment.center,
      children: [
        if (leading != null) ...[leading!, const SizedBox(width: 8)],
        Text(
          label,
          maxLines: 1,
          style: DayliText.serif(
            context,
            size: textSize,
            weight: FontWeight.w600,
            tracking: DayliTracking.tighter,
            color: foreground,
          ),
        ),
        if (arrow) ...[
          const SizedBox(width: 8),
          SvgPicture.string(
            _arrowSvg,
            width: 14,
            height: 8,
            colorFilter: ColorFilter.mode(foreground, BlendMode.srcIn),
          ),
        ],
      ],
    );

    return Opacity(
      opacity: onPressed == null ? 0.6 : 1,
      child: Material(
        color: background,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onPressed,
          child: Padding(padding: padding, child: content),
        ),
      ),
    );
  }
}

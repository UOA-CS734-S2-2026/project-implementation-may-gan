import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/theme.dart';

class LegalLinks extends StatelessWidget {
  const LegalLinks({
    super.key,
    this.notice = true,
    this.draftMarker = false,
    this.compact = false,
    this.center = false,
  });

  final bool notice;
  final bool draftMarker;
  final bool compact;
  final bool center;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Column(
      crossAxisAlignment: center
          ? CrossAxisAlignment.center
          : CrossAxisAlignment.start,
      children: [
        Wrap(
          alignment: center ? WrapAlignment.center : WrapAlignment.start,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            TextButton(
              key: const Key('legal.openPrivacy'),
              onPressed: () => context.push('/privacy'),
              style: _style(context, colors),
              child: const Text('Privacy Policy'),
            ),
            Text(
              ' · ',
              style: DayliText.sans(
                context,
                size: DayliTextSize.sm,
                color: colors.foregroundSecondary,
              ),
            ),
            TextButton(
              key: const Key('legal.openTerms'),
              onPressed: () => context.push('/terms'),
              style: _style(context, colors),
              child: const Text('Terms of Service'),
            ),
            if (draftMarker)
              Text(
                '(draft)',
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.xs,
                  color: colors.foregroundTertiary,
                ),
              ),
          ],
        ),
        if (notice) ...[
          const SizedBox(height: 2),
          Text(
            'Draft documents for review. They are not approved terms or privacy notices.',
            textAlign: center ? TextAlign.center : TextAlign.start,
            style: DayliText.sans(
              context,
              size: DayliTextSize.xs,
              color: colors.foregroundTertiary,
            ),
          ),
        ],
      ],
    );
  }

  ButtonStyle _style(BuildContext context, DayliColors colors) =>
      TextButton.styleFrom(
        foregroundColor: colors.foregroundAccent,
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        textStyle: compact
            ? DayliText.sans(
                context,
                size: DayliTextSize.xs,
                weight: FontWeight.w500,
              )
            : null,
      );
}

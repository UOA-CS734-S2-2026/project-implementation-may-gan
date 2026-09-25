import 'package:flutter/material.dart';

import '../app/theme.dart';

/// Placeholder for WDCC pages whose REST API has not landed yet, styled like
/// the feed's empty state so the WDCC navigation works end to end.
class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen({
    super.key,
    required this.title,
    required this.message,
  });

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 96, 16, 48),
    children: [
      Text(
        title,
        textAlign: TextAlign.center,
        style: DayliText.serif(
          context,
          size: DayliTextSize.xxxxl,
          weight: FontWeight.w600,
          tracking: DayliTracking.tighter,
        ),
      ),
      const SizedBox(height: 180),
      Text(
        message,
        textAlign: TextAlign.center,
        style: DayliText.serif(
          context,
          size: DayliTextSize.lg,
          weight: FontWeight.w500,
          tracking: DayliTracking.tight,
          color: DayliColors.of(context).foregroundSecondary,
        ),
      ),
    ],
  );
}

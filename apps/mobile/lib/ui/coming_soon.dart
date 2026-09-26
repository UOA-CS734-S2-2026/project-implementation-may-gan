import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../app/theme.dart';
import 'nav_icons.dart';

/// A tab whose REST API has not landed yet: its title, then a friendly
/// empty state, so the navigation works end to end.
class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen({
    super.key,
    required this.title,
    required this.icon,
    required this.message,
  });

  final String title;
  final String icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        Text(
          title,
          style: DayliText.serif(
            context,
            fontSize: 30,
            weight: FontWeight.w600,
            tracking: DayliTracking.tighter,
          ),
        ),
        const SizedBox(height: 96),
        Center(
          child: Container(
            width: 80,
            height: 80,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: colors.backgroundAccent,
              shape: BoxShape.circle,
            ),
            child: SvgPicture.string(
              navIconSvg(icon),
              width: 36,
              height: 36,
              colorFilter: ColorFilter.mode(
                colors.foregroundAccent,
                BlendMode.srcIn,
              ),
            ),
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'coming soon',
          textAlign: TextAlign.center,
          style: DayliText.serif(
            context,
            size: DayliTextSize.xl,
            weight: FontWeight.w600,
            tracking: DayliTracking.tight,
          ),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: DayliText.sans(context, color: colors.foregroundSecondary),
          ),
        ),
      ],
    );
  }
}

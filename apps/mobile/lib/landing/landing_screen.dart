import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../app/theme.dart';
import '../ui/dayli_button.dart';
import '../ui/surfaces.dart';

/// The signed-out welcome: the logo and tagline, and both actions in the
/// thumb zone.
class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Scaffold(
      backgroundColor: colors.background,
      body: DayliPage(
        tilted: true,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
            child: Column(
              children: [
                const Spacer(flex: 3),
                const DayliLogo(width: 220),
                const SizedBox(height: 12),
                Text(
                  'A daily reflective social app, for friend groups big and '
                  'small.',
                  textAlign: TextAlign.center,
                  style: DayliText.serif(
                    context,
                    size: DayliTextSize.xl,
                    weight: FontWeight.w500,
                    tracking: DayliTracking.tight,
                  ).copyWith(height: 1.3),
                ),
                const SizedBox(height: 16),
                SvgPicture.asset('assets/wdcc/squiggle02.svg', width: 140),
                const Spacer(flex: 4),
                DayliButton(
                  key: const Key('landing.sign-up'),
                  label: 'Create an account',
                  weight: ButtonWeight.primary,
                  size: ButtonSize.lg,
                  fullWidth: true,
                  height: 52,
                  arrow: true,
                  onPressed: () => context.push('/sign-up'),
                ),
                const SizedBox(height: 12),
                DayliButton(
                  key: const Key('landing.sign-in'),
                  label: 'I already have an account',
                  color: ButtonColor.foreground,
                  size: ButtonSize.lg,
                  fullWidth: true,
                  height: 52,
                  onPressed: () => context.push('/sign-in'),
                ),
                const SizedBox(height: 16),
                Text(
                  'one post, every day.',
                  style: DayliText.serif(
                    context,
                    size: DayliTextSize.sm,
                    color: colors.foregroundTertiary,
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

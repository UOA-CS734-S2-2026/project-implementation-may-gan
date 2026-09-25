import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../app/theme.dart';
import '../ui/dayli_button.dart';
import '../ui/surfaces.dart';

/// The signed-out welcome: a collage of WDCC's photos and a post card, the
/// logo and tagline, and both actions in the thumb zone.
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
                const Expanded(child: _Collage()),
                const SizedBox(height: 12),
                const DayliLogo(width: 180),
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
                const SizedBox(height: 28),
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

class _Collage extends StatelessWidget {
  const _Collage();

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final height = box.maxHeight;
      Widget asset(String name, double size, double degrees) =>
          Transform.rotate(
            angle: degrees * math.pi / 180,
            child: Image.asset(
              'assets/wdcc/landing/$name',
              height: size,
              filterQuality: FilterQuality.medium,
            ),
          );
      final width = box.maxWidth;
      return IgnorePointer(
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            // Back to front: squiggle, post card, then the two photos.
            Positioned(
              top: height * 0.06,
              right: -width * 0.02,
              child: SvgPicture.asset(
                'assets/wdcc/squiggle01.svg',
                height: height * 0.5,
              ),
            ),
            Positioned(
              top: height * 0.02,
              left: width * 0.04,
              child: asset('grid1.jpg', height * 0.8, -4),
            ),
            Positioned(
              top: height * 0.1,
              right: -width * 0.02,
              child: asset('img2.png', height * 0.42, 6),
            ),
            Positioned(
              bottom: 0,
              right: width * 0.1,
              child: asset('img1.png', height * 0.42, -3),
            ),
            Positioned(
              bottom: height * 0.02,
              left: 0,
              child: SvgPicture.asset(
                'assets/wdcc/squiggle03.svg',
                width: width * 0.4,
              ),
            ),
          ],
        ),
      );
    },
  );
}

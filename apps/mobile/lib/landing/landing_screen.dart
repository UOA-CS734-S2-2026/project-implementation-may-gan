import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../app/theme.dart';
import '../ui/surfaces.dart';

/// WDCC's signed-out landing page, with its decorative photos and squiggles.
class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final text = DayliText.serif(
      context,
      size: DayliTextSize.xl,
      weight: FontWeight.w500,
      tracking: DayliTracking.tight,
    ).copyWith(height: 1.25);

    Widget link(
      String label,
      Color background,
      Color foreground,
      EdgeInsets padding,
      String location,
    ) => Material(
      color: background,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        key: Key('landing.${location.substring(1)}'),
        borderRadius: BorderRadius.circular(8),
        onTap: () => context.go(location),
        child: Padding(
          padding: padding,
          child: Text(
            label,
            style: DayliText.serif(
              context,
              weight: FontWeight.w600,
              tracking: DayliTracking.tighter,
              color: foreground,
            ),
          ),
        ),
      ),
    );

    return Scaffold(
      backgroundColor: colors.background,
      body: DayliPage(
        tilted: true,
        child: Stack(
          children: [
            const _Decor(),
            SafeArea(
              child: Stack(
                children: [
                  Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 350),
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const DayliLogo(width: 250),
                              const SizedBox(height: 24),
                              Text(
                                'is a daily reflective social media app, for '
                                'friend groups big and small',
                                textAlign: TextAlign.center,
                                style: text,
                              ),
                              const SizedBox(height: 24),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  link(
                                    'Sign up →',
                                    colors.backgroundAccent,
                                    colors.foregroundAccent,
                                    const EdgeInsets.symmetric(
                                      horizontal: 24,
                                      vertical: 6,
                                    ),
                                    '/sign-up',
                                  ),
                                  const SizedBox(width: 16),
                                  link(
                                    'Sign in',
                                    colors.backgroundTertiary,
                                    colors.foreground,
                                    const EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 6,
                                    ),
                                    '/sign-in',
                                  ),
                                ],
                              ),
                            ],
                          ),
                          Positioned(
                            top: 90,
                            left: 105,
                            child: IgnorePointer(
                              child: Opacity(
                                opacity: 0.2,
                                child: Transform.rotate(
                                  angle: -10 * math.pi / 180,
                                  child: SvgPicture.asset(
                                    'assets/wdcc/squiggle02.svg',
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Positioned(
                    top: 24,
                    left: 0,
                    right: 0,
                    child: Opacity(
                      opacity: 0.5,
                      child: Text(
                        'Dayli by Team WDCC | COMPSCI 732',
                        textAlign: TextAlign.center,
                        style: DayliText.sans(context, size: DayliTextSize.xs),
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 48,
                    left: 0,
                    right: 0,
                    child: IgnorePointer(
                      child: Opacity(
                        opacity: 0.5,
                        child: Text(
                          'one post, every day.',
                          textAlign: TextAlign.center,
                          style: DayliText.sans(
                            context,
                            size: DayliTextSize.lg,
                            weight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The landing page's decorative photos and squiggles, positioned in pixels
/// exactly as WDCC places them, in WDCC's stacking order.
class _Decor extends StatelessWidget {
  const _Decor();

  @override
  Widget build(BuildContext context) {
    Widget photo(String name, double height, double degrees) =>
        Transform.rotate(
          angle: degrees * math.pi / 180,
          child: Image.asset('assets/wdcc/landing/$name', height: height),
        );
    Widget squiggle(String name, double degrees) => Transform.rotate(
      angle: degrees * math.pi / 180,
      child: SvgPicture.asset('assets/wdcc/$name'),
    );

    return IgnorePointer(
      child: Stack(
        clipBehavior: Clip.hardEdge,
        children: [
          Positioned(bottom: -50, right: 180, child: photo('img3.png', 250, 0)),
          Positioned(top: -10, left: -10, child: photo('img4.png', 250, 20)),
          Positioned(
            bottom: 300,
            right: -120,
            child: photo('grid3.jpg', 400, -15),
          ),
          Positioned(bottom: -80, left: 70, child: photo('grid4.jpg', 400, 10)),
          Positioned(bottom: 20, right: 50, child: photo('img2.png', 250, 0)),
          Positioned(top: -180, left: 300, child: photo('grid2.jpg', 400, -10)),
          Positioned(bottom: 200, left: -50, child: photo('img1.png', 250, 0)),
          Positioned(top: -70, right: 200, child: photo('grid1.jpg', 400, 12)),
          Positioned(left: 50, top: 70, child: squiggle('squiggle01.svg', -10)),
          Positioned(
            bottom: 250,
            right: 70,
            child: squiggle('squiggle03.svg', -20),
          ),
        ],
      ),
    );
  }
}

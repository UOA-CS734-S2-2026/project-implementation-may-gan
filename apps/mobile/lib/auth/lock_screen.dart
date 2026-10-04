import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';

class LockScreen extends StatefulWidget {
  const LockScreen({super.key});

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> {
  @override
  void initState() {
    super.initState();
    // Automatically prompt when the screen is shown
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _authenticate();
    });
  }

  Future<void> _authenticate() async {
    if (!mounted) return;
    final biometric = AppScope.of(context).biometric;
    await biometric.authenticate();
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final lilac = const Color(0xFFDCC8E6).withValues(alpha: 0.5); // Faint pastel lilac
    
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: colors.background,
        body: Stack(
          children: [
            // Scrapbook dot grid background
            Positioned.fill(
              child: Opacity(
                opacity: 0.03, // Very faint
                child: Image.asset(
                  'assets/wdcc/dotgridbg.jpg',
                  fit: BoxFit.cover,
                ),
              ),
            ),
            // Decorative pastel squiggles
            Positioned(
              top: 100,
              left: -30,
              child: SvgPicture.asset(
                'assets/wdcc/squiggle01.svg',
                width: 140,
                colorFilter: ColorFilter.mode(lilac, BlendMode.srcIn),
              ),
            ),
            Positioned(
              bottom: 120,
              right: -40,
              child: SvgPicture.asset(
                'assets/wdcc/squiggle02.svg',
                width: 180,
                colorFilter: ColorFilter.mode(lilac, BlendMode.srcIn),
              ),
            ),
            Positioned(
              top: MediaQuery.of(context).size.height * 0.25,
              right: 30,
              child: SvgPicture.asset(
                'assets/wdcc/squiggle03.svg',
                width: 90,
                colorFilter: ColorFilter.mode(lilac, BlendMode.srcIn),
              ),
            ),
            Positioned(
              bottom: MediaQuery.of(context).size.height * 0.15,
              left: 20,
              child: SvgPicture.asset(
                'assets/wdcc/squiggle01.svg',
                width: 100,
                colorFilter: ColorFilter.mode(lilac, BlendMode.srcIn),
              ),
            ),
            
            // Main Content
            Positioned.fill(
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: colors.background,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: lilac.withValues(alpha: 0.2),
                            blurRadius: 32,
                            spreadRadius: 8,
                          ),
                        ],
                      ),
                      child: SvgPicture.asset(
                        'assets/wdcc/face_id.svg',
                        width: 64,
                        height: 64,
                        colorFilter: ColorFilter.mode(
                          colors.foregroundAccent,
                          BlendMode.srcIn,
                        ),
                      ),
                    ),
                    const SizedBox(height: 32),
                    Text(
                      'App Locked',
                      style: DayliText.serif(
                        context,
                        size: DayliTextSize.xl,
                        weight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Unlock Dayli to continue',
                      style: DayliText.sans(
                        context,
                        color: colors.foregroundSecondary,
                      ),
                    ),
                    const SizedBox(height: 48),
                    FilledButton.icon(
                      onPressed: _authenticate,
                      icon: const Icon(Icons.fingerprint_rounded),
                      label: const Text('Unlock'),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                        textStyle: DayliText.sans(
                          context,
                          weight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

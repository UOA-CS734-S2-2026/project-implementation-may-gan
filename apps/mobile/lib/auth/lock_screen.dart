import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import 'biometric_service.dart';

/// Covers the app while Biometric Unlock is locked.
///
/// This sits above the router's Navigator, so it can't show dialogs; system
/// back is consumed by `DayliApp` while locked.
class LockScreen extends StatefulWidget {
  const LockScreen({super.key});

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> with WidgetsBindingObserver {
  BiometricResult? _result;
  bool _authenticating = false;
  bool _recovering = false;
  bool _recoveryFailed = false;
  bool _autoPromptPending = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Prompt when the lock first appears, or again after a background trip.
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoPrompt());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _autoPrompt();
  }

  /// The OS cancels a prompt started in the background or mid-transition, so
  /// wait until the app is in the foreground.
  void _autoPrompt() {
    if (!_autoPromptPending || !mounted) return;
    final state = WidgetsBinding.instance.lifecycleState;
    if (state != null && state != AppLifecycleState.resumed) return;
    _autoPromptPending = false;
    _unlock();
  }

  Future<void> _unlock() async {
    if (!mounted || _authenticating || _recovering) return;
    final biometric = AppScope.of(context).biometric;
    setState(() {
      _authenticating = true;
      _recoveryFailed = false;
    });
    final result = await biometric.unlock();
    if (!mounted) return;
    setState(() {
      _authenticating = false;
      _result = result;
    });
  }

  Future<void> _recover() async {
    if (_authenticating || _recovering) return;
    final services = AppScope.of(context);
    setState(() {
      _recovering = true;
      _recoveryFailed = false;
    });
    var recovered = false;
    try {
      recovered = await services.biometric.recoverWithAccount(services.session);
    } catch (_) {
      // The lock stays on; the person can try again.
    }
    // Success removes this screen.
    if (!mounted) return;
    setState(() {
      _recovering = false;
      _recoveryFailed = !recovered;
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final unavailable = _result == BiometricResult.unavailable;
    final lockedOut = _result == BiometricResult.lockedOut;
    final busy = _authenticating || _recovering;

    final message = switch (_result) {
      BiometricResult.unavailable =>
        "Face ID, fingerprint, and the device passcode are turned off, so "
            "Dayli can't confirm it's you.",
      BiometricResult.lockedOut => 'Too many attempts. Try again in a moment.',
      _ => 'Unlock Dayli to continue',
    };

    // Its own messenger keeps the app's snackbars off the lock screen.
    return ScaffoldMessenger(
      child: Scaffold(
        backgroundColor: colors.background,
        body: LockBackdrop(
          child: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const _FaceIdBadge(),
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
                      message,
                      textAlign: TextAlign.center,
                      style: DayliText.sans(
                        context,
                        color: colors.foregroundSecondary,
                      ),
                    ),
                    const SizedBox(height: 48),
                    if (unavailable)
                      _PrimaryButton(
                        key: const Key('lock.recover'),
                        onPressed: busy ? null : _recover,
                        icon: Icons.login_rounded,
                        label: 'Sign in again',
                      )
                    else
                      _PrimaryButton(
                        key: const Key('lock.unlock'),
                        onPressed: busy ? null : _unlock,
                        icon: Icons.fingerprint_rounded,
                        label: 'Unlock',
                      ),
                    if (lockedOut) ...[
                      const SizedBox(height: 8),
                      TextButton(
                        key: const Key('lock.recoverInstead'),
                        onPressed: busy ? null : _recover,
                        child: const Text('Sign in with your account instead'),
                      ),
                    ],
                    if (unavailable || lockedOut) ...[
                      const SizedBox(height: 16),
                      Text(
                        "You'll sign in to your Dayli account again and "
                        'Biometric Unlock will turn off. Your draft stays '
                        'on this device.',
                        textAlign: TextAlign.center,
                        style: DayliText.sans(
                          context,
                          size: DayliTextSize.sm,
                          color: colors.foregroundTertiary,
                        ),
                      ),
                    ],
                    if (_recoveryFailed) ...[
                      const SizedBox(height: 16),
                      Text(
                        "Couldn't sign out. Try again.",
                        textAlign: TextAlign.center,
                        style: DayliText.sans(
                          context,
                          size: DayliTextSize.sm,
                          color: colors.danger,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Hides app content while the app is inactive, for example in the app
/// switcher, without asking for authentication.
class PrivacyShield extends StatelessWidget {
  const PrivacyShield({super.key});

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: DayliColors.of(context).background,
    child: const LockBackdrop(child: Center(child: _FaceIdBadge())),
  );
}

/// The scrapbook backdrop shared by the lock screen and privacy shield.
class LockBackdrop extends StatelessWidget {
  const LockBackdrop({super.key, required this.child});

  final Widget child;

  static const _lilac = Color(0x80DCC8E6); // Faint pastel lilac.

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    Widget squiggle(String asset, double width) => SvgPicture.asset(
      asset,
      width: width,
      colorFilter: const ColorFilter.mode(_lilac, BlendMode.srcIn),
    );

    return Stack(
      children: [
        // Scrapbook dot grid background.
        Positioned.fill(
          child: Opacity(
            opacity: 0.03, // Very faint.
            child: Image.asset('assets/wdcc/dotgridbg.jpg', fit: BoxFit.cover),
          ),
        ),
        // Decorative pastel squiggles.
        Positioned(
          top: 100,
          left: -30,
          child: squiggle('assets/wdcc/squiggle01.svg', 140),
        ),
        Positioned(
          bottom: 120,
          right: -40,
          child: squiggle('assets/wdcc/squiggle02.svg', 180),
        ),
        Positioned(
          top: size.height * 0.25,
          right: 30,
          child: squiggle('assets/wdcc/squiggle03.svg', 90),
        ),
        Positioned(
          bottom: size.height * 0.15,
          left: 20,
          child: squiggle('assets/wdcc/squiggle01.svg', 100),
        ),
        Positioned.fill(child: child),
      ],
    );
  }
}

class _FaceIdBadge extends StatelessWidget {
  const _FaceIdBadge();

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: colors.background,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: LockBackdrop._lilac.withValues(alpha: 0.2),
            blurRadius: 32,
            spreadRadius: 8,
          ),
        ],
      ),
      child: SvgPicture.asset(
        'assets/wdcc/face_id.svg',
        width: 64,
        height: 64,
        colorFilter: ColorFilter.mode(colors.foregroundAccent, BlendMode.srcIn),
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    super.key,
    required this.onPressed,
    required this.icon,
    required this.label,
  });

  final VoidCallback? onPressed;
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => FilledButton.icon(
    onPressed: onPressed,
    icon: Icon(icon),
    label: Text(label),
    style: FilledButton.styleFrom(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
      textStyle: DayliText.sans(context, weight: FontWeight.w600),
    ),
  );
}

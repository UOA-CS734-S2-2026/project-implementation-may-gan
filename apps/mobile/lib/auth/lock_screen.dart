import 'package:flutter/material.dart';

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
    
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: colors.background,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.lock_outline_rounded,
                size: 64,
                color: colors.foregroundAccent,
              ),
              const SizedBox(height: 24),
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
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: _authenticate,
                icon: const Icon(Icons.fingerprint_rounded),
                label: const Text('Unlock'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

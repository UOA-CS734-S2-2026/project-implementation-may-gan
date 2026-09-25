import 'package:flutter/material.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import '../ui/dayli_button.dart';

/// WDCC's settings page. Usernames and profile visibility arrive with the
/// profile API (#68). Signing out also removes the unsent draft.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context).session;
    final user = session.user;
    final colors = DayliColors.of(context);
    final border = Border.all(color: colors.foreground.withValues(alpha: 0.1));

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 64, 16, 64),
      children: [
        Text(
          'Settings',
          style: DayliText.sans(
            context,
            size: DayliTextSize.xxl,
            weight: FontWeight.w600,
            tracking: DayliTracking.tight,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Your account details.',
          style: DayliText.sans(
            context,
            size: DayliTextSize.sm,
            color: colors.foreground.withValues(alpha: 0.6),
          ),
        ),
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: border,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            children: [
              const _Row(label: 'Username', value: 'not set yet'),
              const SizedBox(height: 12),
              _Row(label: 'Name', value: user?.name ?? ''),
              const SizedBox(height: 12),
              _Row(label: 'Email', value: user?.email ?? ''),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: border,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Private profile',
                      style: DayliText.sans(
                        context,
                        size: DayliTextSize.sm,
                        weight: FontWeight.w500,
                      ),
                    ),
                    Text(
                      'Anyone can see your profile',
                      style: DayliText.sans(
                        context,
                        size: DayliTextSize.xs,
                        color: colors.foreground.withValues(alpha: 0.6),
                      ),
                    ),
                  ],
                ),
              ),
              // Shown disabled until the profile API can save it.
              Opacity(
                opacity: 0.6,
                child: Container(
                  width: 44,
                  height: 24,
                  padding: const EdgeInsets.all(2),
                  alignment: Alignment.centerLeft,
                  decoration: BoxDecoration(
                    color: colors.foreground.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Container(
                    width: 20,
                    height: 20,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(color: Color(0x0D000000), blurRadius: 2),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Align(
          alignment: Alignment.centerLeft,
          child: DayliButton(
            key: const Key('settings.signOut'),
            label: 'Sign out',
            onPressed: session.signOut,
          ),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  /// Tailwind `capitalize`, as WDCC applies to every value.
  static String _capitalize(String value) => value.replaceAllMapped(
    RegExp(r'(^|[\s@.\-_])([a-z])'),
    (match) => '${match[1]}${match[2]!.toUpperCase()}',
  );

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Row(
      children: [
        Text(
          label,
          style: DayliText.sans(
            context,
            size: DayliTextSize.sm,
            color: colors.foreground.withValues(alpha: 0.6),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Text(
            _capitalize(value),
            textAlign: TextAlign.right,
            overflow: TextOverflow.ellipsis,
            style: DayliText.sans(
              context,
              size: DayliTextSize.sm,
              weight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';

/// Account settings as grouped rows. Usernames and profile visibility arrive
/// with the profile API (#68). Signing out also removes the unsent draft.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Future<void> _linkGoogle() async {
    final services = AppScope.of(context);
    final google = services.google;
    if (google == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Google sign-in isn't set up for this build yet."),
        ),
      );
      return;
    }

    final password = await _requestCurrentPassword();
    if (!mounted || password == null) return;
    try {
      await services.session.linkGoogle(provider: google, password: password);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Google is now connected to this account.'),
        ),
      );
    } on Exception {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Could not connect Google. Check your password and use the Google account with this email.',
          ),
        ),
      );
    }
  }

  Future<String?> _requestCurrentPassword() async {
    final controller = TextEditingController();
    final password = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Connect Google'),
        content: TextField(
          controller: controller,
          autofocus: true,
          obscureText: true,
          autocorrect: false,
          enableSuggestions: false,
          keyboardType: TextInputType.visiblePassword,
          autofillHints: const [AutofillHints.password],
          decoration: const InputDecoration(
            labelText: 'Current password',
            helperText: 'Your Google email must match your Dayli email.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    controller.dispose();
    return password;
  }

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context).session;
    final user = session.user;
    final colors = DayliColors.of(context);
    final name = user?.name ?? '';
    final initial = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();

    return Scaffold(
      backgroundColor: colors.background,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 32),
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: 'Back',
                  onPressed: () =>
                      context.canPop() ? context.pop() : context.go('/'),
                  icon: const Icon(Icons.arrow_back_rounded),
                ),
                Text(
                  'settings',
                  style: DayliText.serif(
                    context,
                    size: DayliTextSize.xl,
                    weight: FontWeight.w600,
                    tracking: DayliTracking.tight,
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 64,
                        height: 64,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: colors.backgroundAccent,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          initial,
                          style: DayliText.serif(
                            context,
                            fontSize: 28,
                            weight: FontWeight.w600,
                            color: colors.foregroundAccent,
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: DayliText.serif(
                                context,
                                fontSize: 24,
                                weight: FontWeight.w600,
                                tracking: DayliTracking.tight,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              user?.email ?? '',
                              overflow: TextOverflow.ellipsis,
                              style: DayliText.sans(
                                context,
                                size: DayliTextSize.sm,
                                color: colors.foregroundSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 28),
                  const _GroupLabel('account'),
                  _Group(
                    children: [
                      _Row(label: 'Name', value: name),
                      _Row(label: 'Email', value: user?.email ?? ''),
                      const _Row(
                        label: 'Username',
                        value: 'not set yet',
                        muted: true,
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  const _GroupLabel('sign-in methods'),
                  _Group(
                    children: [
                      InkWell(
                        key: const Key('settings.linkGoogle'),
                        onTap: _linkGoogle,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 16,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Connect Google',
                                style: DayliText.sans(
                                  context,
                                  weight: FontWeight.w500,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Choose this yourself. Matching emails are never connected automatically.',
                                style: DayliText.sans(
                                  context,
                                  size: DayliTextSize.sm,
                                  color: colors.foregroundTertiary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  const _GroupLabel('privacy'),
                  _Group(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
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
                                      weight: FontWeight.w500,
                                    ),
                                  ),
                                  Text(
                                    'Available once profiles arrive.',
                                    style: DayliText.sans(
                                      context,
                                      size: DayliTextSize.sm,
                                      color: colors.foregroundTertiary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            // Disabled until the profile API can save it.
                            const Switch(value: false, onChanged: null),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _Group(
                    children: [
                      InkWell(
                        key: const Key('settings.signOut'),
                        onTap: session.signOut,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 16,
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.logout_rounded,
                                size: 20,
                                color: colors.danger,
                              ),
                              const SizedBox(width: 12),
                              Text(
                                'Sign out',
                                style: DayliText.sans(
                                  context,
                                  weight: FontWeight.w500,
                                  color: colors.danger,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Signing out removes your unsent draft from this device.',
                    style: DayliText.sans(
                      context,
                      size: DayliTextSize.sm,
                      color: colors.foregroundTertiary,
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

class _GroupLabel extends StatelessWidget {
  const _GroupLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 4, bottom: 8),
    child: Text(
      text,
      style: DayliText.serif(
        context,
        size: DayliTextSize.base,
        weight: FontWeight.w600,
        color: DayliColors.of(context).foregroundSecondary,
      ),
    ),
  );
}

class _Group extends StatelessWidget {
  const _Group({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: colors.card,
        borderRadius: BorderRadius.circular(16),
        boxShadow: DayliShadows.card,
      ),
      child: Material(
        type: MaterialType.transparency,
        child: Column(
          children: [
            for (var index = 0; index < children.length; index++) ...[
              if (index > 0)
                Divider(
                  height: 1,
                  indent: 16,
                  color: colors.foreground.withValues(alpha: 0.06),
                ),
              children[index],
            ],
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, this.muted = false});

  final String label;
  final String value;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 52),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Text(
              label,
              style: DayliText.sans(context, color: colors.foregroundSecondary),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                value,
                textAlign: TextAlign.right,
                overflow: TextOverflow.ellipsis,
                style: DayliText.sans(
                  context,
                  weight: FontWeight.w500,
                  color: muted ? colors.foregroundTertiary : colors.foreground,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import '../ui/dayli_button.dart';
import '../ui/form_input.dart';
import 'native_session.dart';

class UsernameSetupScreen extends StatefulWidget {
  const UsernameSetupScreen({super.key});

  @override
  State<UsernameSetupScreen> createState() => _UsernameSetupScreenState();
}

class _UsernameSetupScreenState extends State<UsernameSetupScreen> {
  final _username = TextEditingController();
  final _publicName = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _username.dispose();
    _publicName.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final username = _username.text.trim().toLowerCase();
    if (!RegExp(r'^[a-z0-9][a-z0-9_]{2,29}$').hasMatch(username)) {
      setState(
        () => _error = 'Use 3-30 lowercase letters, numbers, or underscores.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final returnIntent = AppScope.of(context).session
          .resolvePublicReturnIntent(GoRouterState.of(context).uri);
      await AppScope.of(context).session.completeUsernameSetup(
        username: username,
        publicName: _publicName.text,
      );
      if (mounted) {
        context.go(returnIntent?.returnLocation ?? '/');
      }
    } on AuthenticationFailure catch (error) {
      if (mounted) {
        setState(
          () => _error = error.statusCode == 409
              ? 'That username is already taken.'
              : 'Could not save your username.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return Scaffold(
      backgroundColor: colors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'one last thing',
                  style: DayliText.sans(
                    context,
                    size: DayliTextSize.sm,
                    color: colors.foregroundTertiary,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Choose your username',
                  style: DayliText.serif(
                    context,
                    fontSize: 32,
                    weight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Friends use this to find you. You cannot change it here after setup.',
                  style: DayliText.sans(
                    context,
                    color: colors.foregroundSecondary,
                  ),
                ),
                const SizedBox(height: 28),
                DayliFormInput(
                  label: 'Username',
                  fieldKey: const Key('setup.username'),
                  controller: _username,
                  autofillHints: const [AutofillHints.username],
                  textInputAction: TextInputAction.next,
                  error: _error,
                ),
                const SizedBox(height: 16),
                DayliFormInput(
                  label: 'Public name (optional)',
                  fieldKey: const Key('setup.publicName'),
                  controller: _publicName,
                  autofillHints: const [AutofillHints.name],
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _busy ? null : _submit(),
                ),
                const SizedBox(height: 8),
                Text(
                  'Leave this blank to appear as your username. We do not publish your Google name.',
                  style: DayliText.sans(
                    context,
                    size: DayliTextSize.sm,
                    color: colors.foregroundTertiary,
                  ),
                ),
                const SizedBox(height: 28),
                DayliButton(
                  label: _busy ? 'Saving…' : 'Continue',
                  weight: ButtonWeight.primary,
                  size: ButtonSize.lg,
                  fullWidth: true,
                  onPressed: _busy ? null : _submit,
                ),
                if (AppScope.of(context).accountExports != null)
                  TextButton(
                    onPressed: () => context.push('/account/export'),
                    child: const Text('Your data export'),
                  ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => AppScope.of(context).session.signOut(),
                  child: const Text('Sign out'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

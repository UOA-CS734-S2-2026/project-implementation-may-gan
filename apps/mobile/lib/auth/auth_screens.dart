import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import '../ui/dayli_button.dart';
import '../ui/form_input.dart';
import '../ui/google_sign_in_button.dart';
import '../ui/live_clock.dart';
import '../ui/surfaces.dart';
import 'native_session.dart';

enum AuthMode { signIn, signUp }

/// WDCC's sign-in and sign-up pages: the logo above a white auth card.
class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.mode});

  final AuthMode mode;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _name = TextEditingController();
  final _username = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  Map<String, String> _fieldErrors = const {};
  String? _error;

  bool get _signUp => widget.mode == AuthMode.signUp;

  @override
  void dispose() {
    _name.dispose();
    _username.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  /// WDCC's zod rules for each form.
  Map<String, String> _validate() {
    final errors = <String, String>{};
    if (_signUp) {
      if (_name.text.trim().isEmpty) errors['name'] = 'Name is required';
      if (_username.text.trim().isEmpty) {
        errors['username'] = 'Username is required';
      }
      if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(_email.text.trim())) {
        errors['email'] = 'Invalid email address';
      }
      if (_password.text.length < 8) {
        errors['password'] = 'Password must be at least 8 characters';
      }
    } else {
      if (_email.text.trim().isEmpty) {
        errors['email'] = 'Email or username is required';
      }
      if (_password.text.isEmpty) errors['password'] = 'Password is required';
    }
    return errors;
  }

  Future<void> _submit() async {
    final errors = _validate();
    setState(() {
      _fieldErrors = errors;
      _error = null;
    });
    if (errors.isNotEmpty) return;

    final identifier = _email.text.trim();
    // Username sign-in arrives with usernames on the profile API (#68).
    if (!_signUp && !identifier.contains('@')) {
      setState(() => _error = 'Sign in with your email for now.');
      return;
    }

    FocusScope.of(context).unfocus();
    final session = AppScope.of(context).session;
    await _run(
      () => _signUp
          // The API has no usernames until #68, so the handle is collected
          // here but not sent yet.
          ? session.signUp(
              name: _name.text.trim(),
              email: identifier,
              password: _password.text,
            )
          : session.signIn(email: identifier, password: _password.text),
      rejected: _signUp
          ? "That account couldn't be created. Check your details."
          : 'Invalid credentials.',
    );
  }

  Future<void> _signInWithGoogle() async {
    final services = AppScope.of(context);
    final google = services.google;
    if (google == null) {
      setState(
        () => _error = "Google sign-in isn't set up for this build yet.",
      );
      return;
    }
    await _run(
      () => services.session.signInWithGoogle(google),
      rejected: "Google sign-in didn't complete. Try again.",
    );
  }

  Future<void> _run(
    Future<void> Function() action, {
    required String rejected,
  }) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on AuthenticationFailure catch (failure) {
      setState(
        () => _error = failure.statusCode == 401 || failure.statusCode == 400
            ? rejected
            : 'Dayli is having trouble right now. Try again shortly.',
      );
    } catch (_) {
      setState(() => _error = "You're offline. Connect and try again.");
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final orStyle = _signUp
        ? DayliText.serif(
            context,
            size: DayliTextSize.xs,
            color: colors.foreground.withValues(alpha: 0.4),
          )
        : DayliText.serif(
            context,
            size: DayliTextSize.sm,
            color: colors.foregroundTertiary,
          );

    final form = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          _signUp ? "Let's get you started" : 'Welcome back',
          style: DayliText.serif(
            context,
            size: DayliTextSize.xxl,
            weight: FontWeight.w600,
            tracking: DayliTracking.tight,
          ),
        ),
        const SizedBox(height: 32),
        GoogleSignInButton(onPressed: _busy ? null : _signInWithGoogle),
        const SizedBox(height: 16),
        DayliDivider(label: 'or', thickness: 1, labelStyle: orStyle),
        const SizedBox(height: 16),
        if (_signUp) ...[
          DayliFormInput(
            label: 'Name',
            fieldKey: const Key('auth.name'),
            controller: _name,
            autofillHints: const [AutofillHints.name],
            textCapitalization: TextCapitalization.words,
            error: _fieldErrors['name'],
          ),
          const SizedBox(height: 16),
          DayliFormInput(
            label: 'Username',
            fieldKey: const Key('auth.username'),
            controller: _username,
            autofillHints: const [AutofillHints.newUsername],
            error: _fieldErrors['username'],
          ),
          const SizedBox(height: 16),
        ],
        DayliFormInput(
          label: _signUp ? 'Email' : 'Email or username',
          fieldKey: const Key('auth.email'),
          controller: _email,
          placeholder: _signUp ? null : 'you@example.com or @handle',
          keyboardType: TextInputType.emailAddress,
          autofillHints: [
            _signUp ? AutofillHints.email : AutofillHints.username,
          ],
          error: _fieldErrors['email'],
        ),
        const SizedBox(height: 16),
        DayliFormInput(
          label: 'Password',
          fieldKey: const Key('auth.password'),
          controller: _password,
          obscureText: true,
          autofillHints: [
            _signUp ? AutofillHints.newPassword : AutofillHints.password,
          ],
          error: _fieldErrors['password'],
        ),
        if (_error != null) ...[
          const SizedBox(height: 16),
          Text(
            _error!,
            key: const Key('auth.error'),
            style: DayliText.sans(
              context,
              size: DayliTextSize.sm,
              color: colors.danger,
            ),
          ),
        ],
        const SizedBox(height: 32),
        Row(
          children: [
            DayliButton(
              key: const Key('auth.submit'),
              label: _busy
                  ? (_signUp ? 'Creating…' : 'Signing in…')
                  : (_signUp ? "Let's go" : 'Sign in'),
              size: ButtonSize.sm,
              arrow: true,
              onPressed: _busy ? null : _submit,
            ),
            const SizedBox(width: 12),
            DayliButton(
              key: const Key('auth.switch'),
              label: _signUp ? 'I have an account' : 'Sign up',
              size: ButtonSize.sm,
              color: ButtonColor.foreground,
              onPressed: () => context.go(_signUp ? '/sign-in' : '/sign-up'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        const Align(alignment: Alignment.centerRight, child: LiveClock()),
      ],
    );

    return Scaffold(
      backgroundColor: colors.background,
      body: DayliPage(
        tilted: true,
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
              child: ConstrainedBox(
                // On phones WDCC's card shrinks to the 250px logo column.
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.sizeOf(context).width < 768 ? 250 : 358,
                ),
                child: AutofillGroup(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const DayliLogo(width: 250),
                      DayliCard(
                        padding: const EdgeInsets.all(28),
                        radius: 8,
                        child: form,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

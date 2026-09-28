import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import '../legal/legal_links.dart';
import '../ui/dayli_button.dart';
import '../ui/form_input.dart';
import '../ui/google_sign_in_button.dart';
import '../ui/surfaces.dart';
import 'native_session.dart';

enum AuthMode { signIn, signUp }

/// Sign-in and sign-up as full pages: a clear title, full-width inputs, and
/// one primary action.
class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.mode});

  final AuthMode mode;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  Map<String, String> _fieldErrors = const {};
  String? _error;

  bool get _signUp => widget.mode == AuthMode.signUp;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  /// WDCC's zod rules for each form.
  Map<String, String> _validate() {
    final errors = <String, String>{};
    if (_signUp) {
      if (_name.text.trim().isEmpty) errors['name'] = 'Name is required';
      if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(_email.text.trim())) {
        errors['email'] = 'Invalid email address';
      }
      if (_password.text.length < 8) {
        errors['password'] = 'Password must be at least 8 characters';
      }
    } else {
      if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(_email.text.trim())) {
        errors['email'] = 'Invalid email address';
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

    final email = _email.text.trim();

    FocusScope.of(context).unfocus();
    final session = AppScope.of(context).session;
    await _run(
      () => _signUp
          ? session.signUp(
              name: _name.text.trim(),
              email: email,
              password: _password.text,
            )
          : session.signIn(email: email, password: _password.text),
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

  bool _showPassword = false;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final form = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          _signUp ? "Let's get you started" : 'Welcome back',
          style: DayliText.serif(
            context,
            fontSize: 32,
            weight: FontWeight.w600,
            tracking: DayliTracking.tighter,
          ).copyWith(height: 1.15),
        ),
        const SizedBox(height: 4),
        const LegalLinks(notice: false),
        const SizedBox(height: 12),
        GoogleSignInButton(onPressed: _busy ? null : _signInWithGoogle),
        const SizedBox(height: 12),
        DayliDivider(
          label: 'or',
          thickness: 1,
          labelStyle: DayliText.serif(
            context,
            size: DayliTextSize.sm,
            color: colors.foregroundTertiary,
          ),
        ),
        const SizedBox(height: 20),
        if (_signUp) ...[
          DayliFormInput(
            label: 'Name',
            fieldKey: const Key('auth.name'),
            controller: _name,
            autofillHints: const [AutofillHints.name],
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.words,
            error: _fieldErrors['name'],
          ),
          const SizedBox(height: 16),
        ],
        DayliFormInput(
          label: 'Email',
          fieldKey: const Key('auth.email'),
          controller: _email,
          placeholder: 'you@example.com',
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.email],
          error: _fieldErrors['email'],
        ),
        const SizedBox(height: 16),
        DayliFormInput(
          label: 'Password',
          fieldKey: const Key('auth.password'),
          controller: _password,
          obscureText: !_showPassword,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _busy ? null : _submit(),
          helper: _signUp ? 'At least 8 characters.' : null,
          autofillHints: [
            _signUp ? AutofillHints.newPassword : AutofillHints.password,
          ],
          error: _fieldErrors['password'],
          suffix: IconButton(
            tooltip: _showPassword ? 'Hide password' : 'Show password',
            onPressed: () => setState(() => _showPassword = !_showPassword),
            icon: Icon(
              _showPassword
                  ? Icons.visibility_off_outlined
                  : Icons.visibility_outlined,
              color: colors.foregroundTertiary,
            ),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.danger.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              _error!,
              key: const Key('auth.error'),
              style: DayliText.sans(
                context,
                size: DayliTextSize.sm,
                color: colors.danger,
              ),
            ),
          ),
        ],
        const SizedBox(height: 28),
        DayliButton(
          key: const Key('auth.submit'),
          label: _busy
              ? (_signUp ? 'Creating…' : 'Signing in…')
              : (_signUp ? "Let's go" : 'Sign in'),
          weight: ButtonWeight.primary,
          size: ButtonSize.lg,
          fullWidth: true,
          height: 52,
          arrow: !_busy,
          onPressed: _busy ? null : _submit,
        ),
        const SizedBox(height: 12),
        // Wraps under large text sizes instead of overflowing.
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              _signUp ? 'Already on Dayli?' : 'New to Dayli?',
              style: DayliText.sans(
                context,
                size: DayliTextSize.sm,
                color: colors.foregroundSecondary,
              ),
            ),
            TextButton(
              key: const Key('auth.switch'),
              style: TextButton.styleFrom(
                foregroundColor: colors.foregroundAccent,
                minimumSize: const Size(48, 48),
              ),
              onPressed: () =>
                  context.pushReplacement(_signUp ? '/sign-in' : '/sign-up'),
              child: Text(
                _signUp ? 'Sign in' : 'Create an account',
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.sm,
                  weight: FontWeight.w600,
                  color: colors.foregroundAccent,
                ),
              ),
            ),
          ],
        ),
      ],
    );

    return Scaffold(
      backgroundColor: colors.background,
      body: DayliPage(
        tilted: true,
        child: SafeArea(
          child: Column(
            children: [
              SizedBox(
                height: 56,
                child: Row(
                  children: [
                    const SizedBox(width: 4),
                    IconButton(
                      tooltip: 'Back',
                      onPressed: () => context.canPop()
                          ? context.pop()
                          : context.go('/welcome'),
                      icon: const Icon(Icons.arrow_back_rounded),
                    ),
                    const Spacer(),
                    const DayliLogo(width: 72),
                    const Spacer(),
                    const SizedBox(width: 52),
                  ],
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: AutofillGroup(child: form),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

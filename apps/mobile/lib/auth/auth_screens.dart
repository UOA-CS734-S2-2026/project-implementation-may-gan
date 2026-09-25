import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import 'native_session.dart';

/// Email sign-in and sign-up, adapted from the web app's auth card.
class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.mode});

  final AuthMode mode;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

enum AuthMode { signIn, signUp }

class _AuthScreenState extends State<AuthScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  bool get _signUp => widget.mode == AuthMode.signUp;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    final session = AppScope.of(context).session;
    try {
      if (_signUp) {
        await session.signUp(
          name: _name.text.trim(),
          email: _email.text.trim(),
          password: _password.text,
        );
      } else {
        await session.signIn(
          email: _email.text.trim(),
          password: _password.text,
        );
      }
    } on AuthenticationFailure catch (failure) {
      setState(
        () => _error = failure.statusCode == 401 || failure.statusCode == 400
            ? (_signUp
                  ? "That account couldn't be created. Check your details."
                  : 'That email and password do not match.')
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
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: Column(
                children: [
                  Text(
                    'Dayli',
                    style: text.displaySmall?.copyWith(
                      color: colors.accent,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'a daily reflective social media app, for friend groups big and small',
                    textAlign: TextAlign.center,
                    style: text.titleMedium,
                  ),
                  const SizedBox(height: 32),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Form(
                        key: _form,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              _signUp
                                  ? "Let's get you started"
                                  : 'Welcome back',
                              style: text.titleLarge,
                            ),
                            const SizedBox(height: 20),
                            if (_signUp) ...[
                              TextFormField(
                                key: const Key('auth.name'),
                                controller: _name,
                                decoration: const InputDecoration(
                                  labelText: 'Name',
                                ),
                                autofillHints: const [AutofillHints.name],
                                validator: (value) =>
                                    (value ?? '').trim().isEmpty
                                    ? 'Name is required'
                                    : null,
                              ),
                              const SizedBox(height: 12),
                            ],
                            TextFormField(
                              key: const Key('auth.email'),
                              controller: _email,
                              keyboardType: TextInputType.emailAddress,
                              autofillHints: const [AutofillHints.email],
                              decoration: const InputDecoration(
                                labelText: 'Email',
                              ),
                              validator: (value) => (value ?? '').contains('@')
                                  ? null
                                  : 'Enter a valid email address',
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              key: const Key('auth.password'),
                              controller: _password,
                              obscureText: true,
                              autofillHints: [
                                _signUp
                                    ? AutofillHints.newPassword
                                    : AutofillHints.password,
                              ],
                              decoration: const InputDecoration(
                                labelText: 'Password',
                              ),
                              validator: (value) =>
                                  _signUp && (value ?? '').length < 8
                                  ? 'Password must be at least 8 characters'
                                  : (value ?? '').isEmpty
                                  ? 'Password is required'
                                  : null,
                            ),
                            if (_error != null) ...[
                              const SizedBox(height: 12),
                              Text(
                                _error!,
                                style: TextStyle(color: colors.danger),
                              ),
                            ],
                            const SizedBox(height: 20),
                            FilledButton(
                              key: const Key('auth.submit'),
                              onPressed: _busy ? null : _submit,
                              child: Text(
                                _busy
                                    ? (_signUp ? 'Signing up…' : 'Signing in…')
                                    : (_signUp ? 'Sign up' : 'Sign in'),
                              ),
                            ),
                            TextButton(
                              onPressed: () =>
                                  context.go(_signUp ? '/sign-in' : '/sign-up'),
                              child: Text(
                                _signUp
                                    ? 'Already have an account? Sign in'
                                    : 'New to Dayli? Sign up',
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

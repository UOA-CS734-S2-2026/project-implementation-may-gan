import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../auth/native_session.dart';
import '../auth/session_controller.dart';
import '../ui/dayli_button.dart';
import 'legal_links.dart';

/// The only authenticated route available while current Terms need an explicit action.
class LegalAcceptanceScreen extends StatefulWidget {
  const LegalAcceptanceScreen({super.key});

  @override
  State<LegalAcceptanceScreen> createState() => _LegalAcceptanceScreenState();
}

class _LegalAcceptanceScreenState extends State<LegalAcceptanceScreen> {
  RegistrationTerms? _terms;
  bool _loading = true;
  bool _accepted = false;
  bool _busy = false;
  String? _error;
  bool _startedTermsLoad = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_startedTermsLoad) return;
    _startedTermsLoad = true;
    _loadTerms();
  }

  Future<void> _loadTerms() async {
    setState(() {
      _loading = true;
      _accepted = false;
      _error = null;
    });
    try {
      final terms = await AppScope.of(
        context,
      ).session.currentRegistrationTerms();
      if (mounted) setState(() => _terms = terms);
    } on Exception {
      if (mounted) {
        setState(
          () =>
              _error = 'Current Terms cannot be verified right now. Try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _retry() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await AppScope.of(context).session.refreshAccountPolicy();
      if (mounted &&
          AppScope.of(context).session.status ==
              SessionStatus.legalAcceptanceRequired) {
        await _loadTerms();
      }
    } on Exception {
      if (mounted) {
        setState(
          () => _error =
              'Account status cannot be verified right now. Try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    final terms = _terms;
    if (!_accepted || terms == null || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AppScope.of(context).session.acceptCurrentLegalTerms(terms);
    } on AuthenticationFailure catch (error) {
      if (!mounted) return;
      setState(() {
        _accepted = false;
        _error = error.statusCode == 409
            ? 'The Terms have changed. Review the current documents and try again.'
            : 'Legal acceptance is unavailable right now. Try again.';
      });
      if (error.statusCode == 409) await _loadTerms();
    } on Exception {
      if (mounted) {
        setState(() {
          _accepted = false;
          _error = 'Legal acceptance is unavailable right now. Try again.';
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context).session;
    final unavailable = session.status == SessionStatus.legalStatusUnavailable;
    return Scaffold(
      appBar: AppBar(title: const Text('Review Terms')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Text(
              'To continue using Dayli, review the current approved documents and explicitly confirm them.',
            ),
            if (_terms != null) ...[
              const SizedBox(height: 8),
              Text('Terms version: ${_terms!.versionId}'),
            ],
            const SizedBox(height: 12),
            const LegalLinks(),
            const SizedBox(height: 24),
            if (unavailable)
              const Text(
                'Account status cannot be verified right now. Try again.',
              )
            else if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_terms == null)
              const Text(
                'Current Terms cannot be verified right now. Try again.',
              )
            else ...[
              CheckboxListTile(
                key: const Key('legal.acceptanceAction'),
                value: _accepted,
                onChanged: _busy
                    ? null
                    : (value) => setState(() => _accepted = value ?? false),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: const Text(
                  'I agree to the Terms of Service, acknowledge the Privacy Policy, and confirm I am 16 or older.',
                ),
              ),
              const SizedBox(height: 16),
              DayliButton(
                key: const Key('legal.acceptanceSubmit'),
                label: _busy ? 'Confirming…' : 'Accept and continue',
                onPressed: _accepted && !_busy ? _submit : null,
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, key: const Key('legal.acceptanceError')),
            ],
            const SizedBox(height: 20),
            TextButton(
              key: const Key('legal.acceptanceRetry'),
              onPressed: _busy ? null : _retry,
              child: const Text('Retry'),
            ),
            TextButton(
              onPressed: () => context.go('/account/export'),
              child: const Text('Your data export'),
            ),
            TextButton(
              key: const Key('legal.acceptanceSignOut'),
              onPressed: _busy ? null : () => session.signOut(),
              child: const Text('Sign out'),
            ),
          ],
        ),
      ),
    );
  }
}

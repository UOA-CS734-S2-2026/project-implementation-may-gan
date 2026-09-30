import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import 'canonical_agreement.dart';
import 'legal_links.dart';
import 'legal_service.dart';

class RestrictedLegalScreen extends StatefulWidget {
  const RestrictedLegalScreen({super.key});

  @override
  State<RestrictedLegalScreen> createState() => _RestrictedLegalScreenState();
}

class _RestrictedLegalScreenState extends State<RestrictedLegalScreen> {
  CanonicalTerms? _terms;
  String? _error;
  bool _busy = false;

  Future<void> _accept() async {
    final terms = _terms;
    if (terms == null) return;
    setState(() { _busy = true; _error = null; });
    try {
      await AppScope.of(context).session.acceptCurrentTerms(terms);
    } on LegalFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context).session;
    final policy = session.accountPolicy;
    final needsAcceptance = policy?.needsLegalAcceptance == true;
    final colors = DayliColors.of(context);
    return Scaffold(
      backgroundColor: colors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(needsAcceptance ? 'Review the current Terms' : 'Account access is restricted', style: DayliText.serif(context, size: DayliTextSize.xl, weight: FontWeight.w600)),
                  const SizedBox(height: 10),
                  Text(
                    needsAcceptance
                        ? 'Normal app access stays unavailable until the server records your current Terms agreement and separate age declaration.'
                        : policy?.restriction == 'underage_restricted'
                            ? 'This restriction cannot be changed with an age declaration.'
                            : 'This account has limited access. Account management actions are not available in this client yet.',
                    style: DayliText.sans(context, color: colors.foregroundSecondary),
                  ),
                  if (needsAcceptance) ...[
                    const SizedBox(height: 16),
                    CanonicalAgreement(enabled: !_busy, onChanged: (terms) => setState(() => _terms = terms)),
                    const SizedBox(height: 12),
                    FilledButton(
                      key: const Key('legal.acceptCurrent'),
                      onPressed: _terms == null || _busy ? null : _accept,
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                      child: Text(_busy ? 'Saving...' : 'Continue'),
                    ),
                  ],
                  if (_error != null) Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error!, key: const Key('legal.error'), style: DayliText.sans(context, color: colors.danger)),
                  ),
                  const SizedBox(height: 18),
                  const LegalLinks(),
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: () async {
                      await session.signOut();
                      if (context.mounted) context.go('/welcome');
                    },
                    icon: const Icon(Icons.logout_rounded),
                    label: const Text('Sign out'),
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

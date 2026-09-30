import 'package:flutter/material.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import 'legal_service.dart';

class CanonicalAgreement extends StatefulWidget {
  const CanonicalAgreement({
    super.key,
    required this.onChanged,
    this.enabled = true,
  });

  final ValueChanged<CanonicalTerms?> onChanged;
  final bool enabled;

  @override
  State<CanonicalAgreement> createState() => _CanonicalAgreementState();
}

class _CanonicalAgreementState extends State<CanonicalAgreement> {
  CanonicalTerms? _terms;
  String? _error;
  bool _read = false;
  bool _accepted = false;
  bool _age = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _terms = null;
      _error = null;
      _read = false;
      _accepted = false;
      _age = false;
    });
    try {
      final legal = AppScope.of(context).legal;
      if (legal == null) throw const LegalFailure('Legal information is unavailable. Try again.');
      final terms = await legal.loadCurrentTerms();
      if (!mounted) return;
      if (terms == null) {
        setState(() => _error = 'Registration is unavailable until current Terms are published.');
        return;
      }
      setState(() => _terms = terms);
    } on LegalFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    }
  }

  void _changed() => widget.onChanged(_read && _accepted && _age ? _terms : null);

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final terms = _terms;
    return Container(
      key: const Key('legal.canonicalAgreement'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.backgroundSecondary,
        border: Border.all(color: colors.foreground.withValues(alpha: 0.15)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Before you create an account', style: DayliText.serif(context, weight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text('Privacy information is available separately. It is not an agreement checkbox.', style: DayliText.sans(context, size: DayliTextSize.sm, color: colors.foregroundSecondary)),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: DayliText.sans(context, size: DayliTextSize.sm, color: colors.danger)),
            TextButton(onPressed: _load, child: const Text('Retry')),
          ],
          if (terms != null) ...[
            const SizedBox(height: 12),
            Text('Terms of Service, version ${terms.version}', style: DayliText.sans(context, weight: FontWeight.w600)),
            Text('Effective ${terms.effectiveAt.toIso8601String()} UTC. Verified digest ${terms.contentDigest.substring(0, 12)}...', style: DayliText.sans(context, size: DayliTextSize.xs, color: colors.foregroundTertiary)),
            const SizedBox(height: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 220),
              child: SingleChildScrollView(child: SelectableText(terms.canonicalContent, style: DayliText.sans(context, size: DayliTextSize.sm, color: colors.foregroundSecondary))),
            ),
            TextButton(
              onPressed: widget.enabled ? () { setState(() => _read = true); _changed(); } : null,
              child: Text(_read ? 'Read version ${terms.version}' : 'I have read version ${terms.version}'),
            ),
            CheckboxListTile(
              key: const Key('legal.acceptTerms'),
              contentPadding: EdgeInsets.zero,
              value: _accepted,
              onChanged: !_read || !widget.enabled ? null : (value) { setState(() => _accepted = value ?? false); _changed(); },
              title: const Text('I agree to the Terms of Service.'),
              controlAffinity: ListTileControlAffinity.leading,
            ),
            CheckboxListTile(
              key: const Key('legal.declareAge'),
              contentPadding: EdgeInsets.zero,
              value: _age,
              onChanged: !_read || !widget.enabled ? null : (value) { setState(() => _age = value ?? false); _changed(); },
              title: const Text('I declare that I am 16 or older.'),
              controlAffinity: ListTileControlAffinity.leading,
            ),
          ],
        ],
      ),
    );
  }
}

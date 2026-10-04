import 'package:flutter/material.dart';

import '../app/app_scope.dart';
import 'account_deletion_client.dart';

class AccountDeletionScreen extends StatefulWidget {
  const AccountDeletionScreen({super.key});

  @override
  State<AccountDeletionScreen> createState() => _AccountDeletionScreenState();
}

class _AccountDeletionScreenState extends State<AccountDeletionScreen> {
  AccountDeletionStatus? _status;
  String? _error;
  bool _loading = true;
  bool _working = false;
  bool _consented = false;
  AccountDeletionClient? _client;
  bool _initialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    _client = AppScope.of(context).accountDeletion;
    _refresh();
  }

  Future<void> _refresh() async {
    final client = _client;
    if (client == null) {
      setState(() => _loading = false);
      return;
    }
    try {
      final status = await client.status();
      if (mounted) {
        setState(() {
          _status = status;
          _error = null;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Deletion status is unavailable. Try again later.';
          _loading = false;
        });
      }
    }
  }

  Future<void> _submit() async {
    final client = _client;
    final pending = _status?.isPending == true;
    if (client == null || _working || (!pending && !_consented)) return;
    final password = await _password(
      pending ? 'Cancel deletion' : 'Request deletion',
    );
    if (!mounted || password == null || password.isEmpty) return;
    setState(() => _working = true);
    try {
      if (pending) {
        await client.cancelWithPassword(password);
      } else {
        await client.requestWithPassword(password);
        if (!mounted) return;
        // The accepted command revokes every server session and push device.
        // Remove this app's bearer and private integrations before it can race
        // a late authenticated request against that server-side revocation.
        await AppScope.of(context).session.sessionExpired();
        return;
      }
      if (!mounted) return;
      setState(() => _consented = false);
      await _refresh();
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = pending
              ? 'Deletion could not be cancelled. Try again later.'
              : 'Deletion could not be requested. Try again later.';
        });
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<String?> _password(String title) async {
    var password = '';
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          key: const Key('accountDeletion.password'),
          autofocus: true,
          obscureText: true,
          autocorrect: false,
          enableSuggestions: false,
          autofillHints: const [AutofillHints.password],
          onChanged: (value) => password = value,
          decoration: const InputDecoration(labelText: 'Current password'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, password),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final available = _client != null;
    final pending = _status?.isPending == true;
    return Scaffold(
      appBar: AppBar(title: const Text('Account deletion')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text(
            'Delete account',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          const Text(
            'This does not delete posts in Trash. Export your data separately if you need a copy.',
          ),
          const SizedBox(height: 20),
          if (!available)
            const Text(
              'Account deletion requests are not available yet. This build will not submit a deletion request until protected staging activation is complete.',
            ),
          if (_loading && available)
            const Center(child: CircularProgressIndicator()),
          if (_status != null)
            Text('Status: ${_status!.state.replaceAll('_', ' ')}'),
          if (pending && _status?.cancelUntil != null) ...[
            const SizedBox(height: 12),
            Text(
              'You can cancel while the server reports cancellation available, currently until ${_status!.cancelUntil!.toLocal()}.',
            ),
          ],
          if (available && _status != null) ...[
            if (!pending)
              CheckboxListTile(
                key: const Key('accountDeletion.consent'),
                value: _consented,
                onChanged: _working
                    ? null
                    : (value) => setState(() => _consented = value == true),
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  'I understand this requests account deletion and have saved anything I need.',
                ),
              ),
            FilledButton(
              key: const Key('accountDeletion.submit'),
              onPressed: _working || (!pending && !_consented) ? null : _submit,
              child: Text(
                _working
                    ? 'Working…'
                    : pending
                    ? 'Cancel deletion'
                    : 'Request deletion',
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Google verification is unavailable in the native app until it can be securely bound to this action.',
            ),
          ],
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!, key: const Key('accountDeletion.error')),
            ),
          TextButton(
            onPressed: _working || !available ? null : _refresh,
            child: const Text('Refresh status'),
          ),
        ],
      ),
    );
  }
}

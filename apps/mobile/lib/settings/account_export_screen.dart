import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../app/app_scope.dart';
import 'account_export_client.dart';

/// An isolated account journey. It is not attached to the normal username gate.
/// No client is installed in AppServices until export activation is approved.
class AccountExportScreen extends StatefulWidget {
  const AccountExportScreen({
    super.key,
    this.shareFile,
    this.temporaryDirectory,
  });

  final Future<void> Function(File file, Rect origin)? shareFile;
  final Future<Directory> Function()? temporaryDirectory;

  @override
  State<AccountExportScreen> createState() => _AccountExportScreenState();
}

class _AccountExportScreenState extends State<AccountExportScreen> {
  AccountExportStatus? _status;
  bool _loaded = false;
  bool _busy = false;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final client = AppScope.of(context).accountExports;
    if (!_loaded && client != null) {
      _loaded = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _refresh();
      });
    }
  }

  Future<void> _refresh() async {
    final services = AppScope.of(context);
    final client = services.accountExports;
    if (client == null || _busy) return;
    final ownerId = services.session.user?.id;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final next = await client.status();
      if (mounted && services.session.user?.id == ownerId) {
        setState(() => _status = next);
      }
    } on Exception {
      if (mounted) {
        setState(
          () => _error = 'Export status is unavailable. Try again later.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _request() async {
    final services = AppScope.of(context);
    final client = services.accountExports;
    if (client == null || _busy) return;
    final ownerId = services.session.user?.id;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await client.request();
      final next = await client.status();
      if (mounted && services.session.user?.id == ownerId) {
        setState(() => _status = next);
      }
    } on Exception {
      if (mounted) {
        setState(
          () => _error = 'Export could not be requested. Try again later.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _download(BuildContext anchor) async {
    final services = AppScope.of(context);
    final client = services.accountExports;
    final requestId = _status?.requestId;
    if (client == null ||
        requestId == null ||
        _busy ||
        _status?.mayDownload != true) {
      return;
    }
    final ownerId = services.session.user?.id;
    final box = anchor.findRenderObject() as RenderBox?;
    final origin = box == null
        ? Rect.zero
        : box.localToGlobal(Offset.zero) & box.size;
    File? file;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final directory =
          await (widget.temporaryDirectory ?? getTemporaryDirectory)();
      final suffix = List<int>.generate(
        12,
        (_) => Random.secure().nextInt(256),
      ).map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
      final destination = File('${directory.path}/dayli-export-v2-$suffix.zip');
      file = await client.download(
        requestId: requestId,
        destination: destination,
      );
      if (!mounted || services.session.user?.id != ownerId) return;
      if (widget.shareFile != null) {
        await widget.shareFile!(file, origin);
      } else {
        await SharePlus.instance.share(
          ShareParams(
            files: [XFile(file.path, mimeType: 'application/zip')],
            sharePositionOrigin: origin,
          ),
        );
      }
    } on Exception {
      if (mounted) {
        setState(
          () => _error =
              'Export download could not be completed. Try again later.',
        );
      }
    } finally {
      try {
        if (file != null && await file.exists()) {
          await file.delete();
        }
      } on FileSystemException {
        if (mounted) {
          setState(
            () => _error =
                'The temporary export could not be removed. Clear this app\'s cache on this device.',
          );
        }
      }
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final enabled = AppScope.of(context).accountExports != null;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Your data export'),
        leading: IconButton(
          tooltip: 'Back',
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!enabled)
              const Text('Account exports are not available yet.')
            else ...[
              const Text(
                'Your ZIP includes approved account records and restorable Trash. It does not extend a deletion deadline.',
              ),
              const SizedBox(height: 20),
              if (_status != null) Text('Status: ${_status!.status}'),
              if (_status?.mayDownload == true) ...[
                const SizedBox(height: 12),
                Text('Available until ${_status!.expiresAt!.toLocal()}.'),
                Builder(
                  builder: (anchor) => FilledButton(
                    onPressed: _busy ? null : () => _download(anchor),
                    child: const Text('Download and share ZIP'),
                  ),
                ),
              ],
              if (_error != null) Text(_error!, key: const Key('export.error')),
              if (_status?.mayRequest == true)
                FilledButton(
                  onPressed: _busy ? null : _request,
                  child: const Text('Request export'),
                ),
              TextButton(
                onPressed: _busy ? null : _refresh,
                child: const Text('Refresh status'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

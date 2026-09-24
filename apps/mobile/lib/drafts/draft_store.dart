import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'daily_post_draft.dart';

/// The outcome of reading a stored draft.
class DraftReadResult {
  const DraftReadResult(this.draft, {this.discarded = false});

  const DraftReadResult.none() : draft = null, discarded = false;

  final DailyPostDraft? draft;

  /// True when a stored draft existed but could not be decrypted or parsed,
  /// for example after the platform key was invalidated, and was removed.
  final bool discarded;
}

abstract interface class DraftStore {
  Future<DraftReadResult> read(String userId);
  Future<void> write(DailyPostDraft draft);
  Future<void> clear(String userId);
}

/// Stores each user's draft in Keychain (iOS) or KeyStore-backed encrypted
/// storage (Android). Drafts never go to shared preferences, files, or logs.
class ProtectedDraftStore implements DraftStore {
  ProtectedDraftStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(),
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.unlocked_this_device,
            ),
          );

  static const keyPrefix = 'dayli.draft.v1.';

  final FlutterSecureStorage _storage;

  String _key(String userId) => '$keyPrefix$userId';

  @override
  Future<DraftReadResult> read(String userId) async {
    final String? raw;
    try {
      raw = await _storage.read(key: _key(userId));
    } catch (_) {
      // An invalidated key or corrupted keystore entry cannot be recovered.
      await _discard(userId);
      return const DraftReadResult(null, discarded: true);
    }
    if (raw == null) return const DraftReadResult.none();

    DailyPostDraft? draft;
    try {
      draft = DailyPostDraft.fromJson(jsonDecode(raw));
    } on FormatException {
      draft = null;
    }
    if (draft == null || draft.userId != userId) {
      await _discard(userId);
      return const DraftReadResult(null, discarded: true);
    }
    return DraftReadResult(draft);
  }

  @override
  Future<void> write(DailyPostDraft draft) => _storage.write(
    key: _key(draft.userId),
    value: jsonEncode(draft.toJson()),
  );

  @override
  Future<void> clear(String userId) => _storage.delete(key: _key(userId));

  Future<void> _discard(String userId) async {
    try {
      await _storage.delete(key: _key(userId));
    } catch (_) {
      // Nothing else can be done; the next write replaces the entry.
    }
  }
}

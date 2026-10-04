import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../drafts/daily_post_draft.dart';

/// A photo or video pick that has started and may not have finished: who began
/// it, and for which draft.
///
/// Android can end the app while the camera or library is open, and what the
/// system finished is then handed back once, to whoever asks first. That is
/// process-wide, not per account, so it must only ever reach the user and the
/// draft that started the pick.
class PendingCapture {
  const PendingCapture({
    required this.userId,
    required this.draftKey,
    required this.startedAt,
    this.recovered,
  });

  final String userId;

  /// The draft's date and idempotency key, which tell today's draft from an
  /// earlier or later one for the same user.
  final String draftKey;
  final DateTime startedAt;

  /// A file the system finished after the app was killed, held here for the
  /// owner when someone else's composer opened first. Never attached to theirs.
  final DraftAttachment? recovered;

  bool ownedBy(String userId, String draftKey) =>
      this.userId == userId && this.draftKey == draftKey;

  PendingCapture holding(DraftAttachment? recovered) => PendingCapture(
    userId: userId,
    draftKey: draftKey,
    startedAt: startedAt,
    recovered: recovered,
  );

  Map<String, Object?> toJson() => {
    'userId': userId,
    'draftKey': draftKey,
    'startedAt': startedAt.toUtc().toIso8601String(),
    if (recovered != null) 'recoveredPath': recovered!.localPath,
    if (recovered != null) 'recoveredType': recovered!.mediaType,
  };

  static PendingCapture? fromJson(Object? json) {
    if (json is! Map) return null;
    final userId = json['userId'];
    final draftKey = json['draftKey'];
    final startedAt = DateTime.tryParse('${json['startedAt']}');
    if (userId is! String || draftKey is! String || startedAt == null) {
      return null;
    }
    final path = json['recoveredPath'];
    final type = json['recoveredType'];
    return PendingCapture(
      userId: userId,
      draftKey: draftKey,
      startedAt: startedAt,
      recovered: path is String && (type == 'image' || type == 'video')
          ? DraftAttachment(localPath: path, mediaType: type as String)
          : null,
    );
  }
}

/// Where the one pending pick is kept so it outlives the process.
abstract interface class PendingCaptureStore {
  Future<PendingCapture?> read();
  Future<void> write(PendingCapture capture);
  Future<void> clear();
}

/// Keychain (iOS) or KeyStore-backed encrypted storage (Android), like drafts:
/// it names an account and a draft, so it never goes to shared preferences.
class ProtectedPendingCaptureStore implements PendingCaptureStore {
  ProtectedPendingCaptureStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(),
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.unlocked_this_device,
            ),
          );

  static const key = 'dayli.pending-capture.v1';

  final FlutterSecureStorage _storage;

  @override
  Future<PendingCapture?> read() async {
    try {
      final raw = await _storage.read(key: key);
      if (raw == null) return null;
      final capture = PendingCapture.fromJson(jsonDecode(raw));
      if (capture == null) await clear();
      return capture;
    } catch (_) {
      // An unreadable marker names no owner, so it can't vouch for anything.
      await clear();
      return null;
    }
  }

  @override
  Future<void> write(PendingCapture capture) =>
      _storage.write(key: key, value: jsonEncode(capture.toJson()));

  @override
  Future<void> clear() async {
    try {
      await _storage.delete(key: key);
    } catch (_) {}
  }
}

Future<void> deleteLocalFile(String path) async {
  try {
    await File(path).delete();
  } catch (_) {
    // Already gone, or not ours to remove: nothing more to do.
  }
}

/// Decides who a recovered photo or video belongs to.
///
/// The composer records the user and draft before opening the camera or the
/// library, and clears that record when the pick returns. If the app was killed
/// meanwhile, the record is still there, and a recovered file is attached only
/// when the composer asking is for that same user and draft. Anything else is
/// kept for its owner (never shown to another account) or removed.
class PendingCaptures {
  PendingCaptures({
    PendingCaptureStore? store,
    Future<void> Function(String path)? deleteFile,
    DateTime Function()? clock,
    this.lifetime = const Duration(hours: 24),
  }) : _store = store ?? ProtectedPendingCaptureStore(),
       _deleteFile = deleteFile ?? deleteLocalFile,
       _clock = clock ?? DateTime.now;

  final PendingCaptureStore _store;
  final Future<void> Function(String path) _deleteFile;
  final DateTime Function() _clock;

  /// How long a pick can wait for its owner before it is given up and removed.
  final Duration lifetime;

  /// Records who is about to pick, before the camera or library opens. A
  /// record that can't be written leaves the pick unowned, so anything the
  /// system hands back later is discarded rather than guessed at.
  Future<void> begin({required String userId, required String draftKey}) async {
    try {
      final previous = await _store.read();
      // A file held for someone else is replaced by this pick's record.
      await _remove(previous?.recovered);
      await _store.write(
        PendingCapture(userId: userId, draftKey: draftKey, startedAt: _clock()),
      );
    } catch (_) {}
  }

  /// The pick came back normally, so there is nothing left to recover.
  Future<void> finish() async {
    try {
      await _store.clear();
    } catch (_) {}
  }

  /// What [lost], the file the system handed back after the app was killed,
  /// means for the composer of [draftKey] and [userId]: the attachment to add,
  /// or null. [lost] is null when the system had nothing; this is still called
  /// then, because a file held for this owner earlier may be waiting.
  Future<DraftAttachment?> recover({
    required String userId,
    required String draftKey,
    required DraftAttachment? lost,
  }) async {
    final PendingCapture? pending;
    try {
      pending = await _store.read();
    } catch (_) {
      await _remove(lost);
      return null;
    }

    if (pending != null && !pending.startedAt.add(lifetime).isAfter(_clock())) {
      await _remove(pending.recovered);
      await _remove(lost);
      await _store.clear();
      return null;
    }

    if (lost == null) {
      if (pending == null || !pending.ownedBy(userId, draftKey)) return null;
      await _store.clear();
      return pending.recovered;
    }

    if (pending == null) {
      // Nobody recorded starting this pick, so nobody can claim its result.
      await _remove(lost);
      return null;
    }
    if (pending.ownedBy(userId, draftKey)) {
      if (pending.recovered?.localPath != lost.localPath) {
        await _remove(pending.recovered);
      }
      await _store.clear();
      return lost;
    }

    // Another account's, or another draft's. Keep it for them; never attach it.
    if (pending.recovered?.localPath != lost.localPath) {
      await _remove(pending.recovered);
    }
    await _store.write(pending.holding(lost));
    return null;
  }

  /// Removes what [userId] has pending, at sign-out.
  Future<void> discardFor(String userId) async {
    try {
      final pending = await _store.read();
      if (pending == null || pending.userId != userId) return;
      await _remove(pending.recovered);
      await _store.clear();
    } catch (_) {}
  }

  Future<void> _remove(DraftAttachment? attachment) async {
    if (attachment != null) await _deleteFile(attachment.localPath);
  }
}

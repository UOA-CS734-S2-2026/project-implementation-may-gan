import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/profile_client.dart';

/// The owner's streak as the server last confirmed it, and when.
class CachedStreak {
  const CachedStreak(this.streak, this.confirmedAt);

  final PostingStreak streak;
  final DateTime confirmedAt;
}

/// Keeps the signed-in owner's last confirmed streak for offline display.
/// It holds one account at a time and never anyone else's streak.
abstract interface class StreakCache {
  /// Changes on every [clear]. A load reads it before its request and passes
  /// it to [write], so a response that lands after a clear is dropped.
  int get epoch;

  Future<CachedStreak?> read(String userId);

  /// Ignored unless [epoch] is still current.
  Future<void> write(String userId, CachedStreak value, {required int epoch});

  /// Finishes any write already started, then removes the value. Completes
  /// with an error if the value couldn't be removed.
  Future<void> clear();
}

/// Stores the streak with the session's other private data, so sign-out and
/// a reinstall remove it too.
class ProtectedStreakCache implements StreakCache {
  ProtectedStreakCache(this._storage);

  static const _key = 'dayli.streak.v1';
  final FlutterSecureStorage _storage;

  int _epoch = 0;

  /// Writes and clears, in the order they were asked for. A failed task
  /// doesn't stop the ones after it.
  Future<void> _queue = Future.value();

  /// Runs [task] after the ones before it and returns its own result,
  /// errors included.
  Future<void> _enqueue(Future<void> Function() task) {
    final result = _queue.then((_) => task());
    _queue = result.catchError((Object _) {});
    return result;
  }

  @override
  int get epoch => _epoch;

  @override
  Future<CachedStreak?> read(String userId) async {
    await _queue;
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return null;
      final json = jsonDecode(raw);
      if (json is! Map<String, Object?> || json['userId'] != userId) {
        return null;
      }
      final streak = PostingStreak.tryParse(json['streak']);
      final confirmedAt = json['confirmedAt'];
      final at = confirmedAt is String ? DateTime.tryParse(confirmedAt) : null;
      if (streak == null || at == null) return null;
      return CachedStreak(streak, at);
    } catch (_) {
      // Unreadable data is never shown. Removing it is best effort here; the
      // next sign-out clears it again.
      await clear().catchError((Object _) {});
      return null;
    }
  }

  @override
  Future<void> write(String userId, CachedStreak value, {required int epoch}) =>
      _enqueue(() async {
        // Checked when the write runs, after any clear queued before it.
        if (epoch != _epoch) return;
        // Offline display is a convenience; a failed write must not break the
        // profile, so its error is dropped.
        await _storage
            .write(
              key: _key,
              value: jsonEncode({
                'userId': userId,
                'streak': {
                  'current': value.streak.current,
                  'longest': value.streak.longest,
                  'postedToday': value.streak.postedToday,
                },
                'confirmedAt': value.confirmedAt.toUtc().toIso8601String(),
              }),
            )
            .catchError((Object _) {});
      });

  @override
  Future<void> clear() {
    _epoch++;
    return _enqueue(() => _storage.delete(key: _key));
  }
}

/// For tests and builds without protected storage.
class MemoryStreakCache implements StreakCache {
  String? _userId;
  CachedStreak? _value;
  int _epoch = 0;

  @override
  int get epoch => _epoch;

  @override
  Future<CachedStreak?> read(String userId) async =>
      _userId == userId ? _value : null;

  @override
  Future<void> write(
    String userId,
    CachedStreak value, {
    required int epoch,
  }) async {
    if (epoch != _epoch) return;
    _userId = userId;
    _value = value;
  }

  @override
  Future<void> clear() async {
    _epoch++;
    _userId = null;
    _value = null;
  }
}

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

  /// Finishes any write already started, then removes the value.
  Future<void> clear();
}

/// Stores the streak with the session's other private data, so sign-out and
/// a reinstall remove it too.
class ProtectedStreakCache implements StreakCache {
  ProtectedStreakCache(this._storage);

  static const _key = 'dayli.streak.v1';
  final FlutterSecureStorage _storage;

  int _epoch = 0;

  /// Writes and clears, in the order they were asked for.
  Future<void> _queue = Future.value();

  Future<void> _enqueue(Future<void> Function() task) =>
      _queue = _queue.then((_) => task()).catchError((Object _) {});

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
      await clear();
      return null;
    }
  }

  @override
  Future<void> write(String userId, CachedStreak value, {required int epoch}) =>
      _enqueue(() async {
        // Checked when the write runs, after any clear queued before it.
        if (epoch != _epoch) return;
        // Offline display is a convenience; a failed write must not break the
        // profile, so errors are dropped by the queue.
        await _storage.write(
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
        );
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

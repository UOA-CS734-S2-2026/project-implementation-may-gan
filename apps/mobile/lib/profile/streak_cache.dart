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
  Future<CachedStreak?> read(String userId);
  Future<void> write(String userId, CachedStreak value);
  Future<void> clear();
}

/// Stores the streak with the session's other private data, so sign-out and
/// a reinstall remove it too.
class ProtectedStreakCache implements StreakCache {
  ProtectedStreakCache(this._storage);

  static const _key = 'dayli.streak.v1';
  final FlutterSecureStorage _storage;

  @override
  Future<CachedStreak?> read(String userId) async {
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
  Future<void> write(String userId, CachedStreak value) async {
    try {
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
    } catch (_) {
      // Offline display is a convenience; a failed write must not break the
      // profile.
    }
  }

  @override
  Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } catch (_) {}
  }
}

/// For tests and builds without protected storage.
class MemoryStreakCache implements StreakCache {
  String? _userId;
  CachedStreak? _value;

  @override
  Future<CachedStreak?> read(String userId) async =>
      _userId == userId ? _value : null;

  @override
  Future<void> write(String userId, CachedStreak value) async {
    _userId = userId;
    _value = value;
  }

  @override
  Future<void> clear() async {
    _userId = null;
    _value = null;
  }
}

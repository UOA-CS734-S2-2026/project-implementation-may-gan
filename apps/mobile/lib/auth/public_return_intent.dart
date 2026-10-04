import 'dart:math';

import 'package:flutter/foundation.dart';

enum PublicActionIntent {
  friendRequest('friend-request'),
  messageRequest('message-request'),
  like('like'),
  comment('comment');

  const PublicActionIntent(this.value);
  final String value;

  static PublicActionIntent? parse(String? value) {
    for (final action in values) {
      if (action.value == value) return action;
    }
    return null;
  }
}

@immutable
class PublicReturnIntent {
  const PublicReturnIntent._({
    required this.target,
    required this.action,
    required this.id,
    required this.issuedAt,
    required this.boundActorId,
  });

  final String target;
  final PublicActionIntent action;
  final String id;
  final DateTime issuedAt;
  final String? boundActorId;

  static final _profile = RegExp(r'^/u/[a-zA-Z0-9_]{2,32}$');
  static final _post = RegExp(r'^/posts/[A-Za-z0-9_-]{1,128}$');

  static bool isPublicTarget(String target) =>
      !target.contains('?') &&
      !target.contains('#') &&
      (_profile.hasMatch(target) || _post.hasMatch(target));

  static bool matchesTarget(String target, PublicActionIntent action) =>
      switch (action) {
        PublicActionIntent.friendRequest ||
        PublicActionIntent.messageRequest => _profile.hasMatch(target),
        PublicActionIntent.like ||
        PublicActionIntent.comment => _post.hasMatch(target),
      };

  Map<String, String> get _query => {
    'returnTo': target,
    'action': action.value,
    'intentId': id,
    'issuedAt': '${issuedAt.millisecondsSinceEpoch}',
    'origin': 'anonymous',
  };

  String authLocation([String path = '/sign-in']) =>
      Uri(path: path, queryParameters: _query).toString();

  String get returnLocation => Uri(
    path: target,
    queryParameters: {
      'action': action.value,
      'intentId': id,
      'issuedAt': '${issuedAt.millisecondsSinceEpoch}',
      'origin': 'anonymous',
    },
  ).toString();
}

/// One in-memory anonymous action handoff. URLs are references to this state,
/// not authority by themselves. A restart, rejection, or consumption removes
/// the capability.
class PublicReturnIntentRegistry {
  PublicReturnIntentRegistry({
    DateTime Function()? clock,
    String Function()? tokenFactory,
  }) : _clock = clock ?? DateTime.now,
       _tokenFactory = tokenFactory ?? _secureToken;

  static const lifetime = Duration(minutes: 10);
  final DateTime Function() _clock;
  final String Function() _tokenFactory;
  PublicReturnIntent? _pending;

  static String _secureToken() {
    final random = Random.secure();
    return List.generate(
      24,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  PublicReturnIntent? issue(String target, PublicActionIntent action) {
    if (!PublicReturnIntent.isPublicTarget(target) ||
        !PublicReturnIntent.matchesTarget(target, action)) {
      clear();
      return null;
    }
    final intent = PublicReturnIntent._(
      target: target,
      action: action,
      id: _tokenFactory(),
      issuedAt: DateTime.fromMillisecondsSinceEpoch(
        _clock().toUtc().millisecondsSinceEpoch,
        isUtc: true,
      ),
      boundActorId: null,
    );
    _pending = intent;
    return intent;
  }

  PublicReturnIntent? resolveAuth(Uri uri, {String? actorId}) {
    final parsed = _parse(uri, auth: true);
    final pending = _pending;
    if (parsed == null || pending == null || !_matches(parsed, pending)) {
      clear();
      return null;
    }
    if (_expired(pending)) {
      clear();
      return null;
    }
    if (actorId == null) return pending;
    if (pending.boundActorId != null && pending.boundActorId != actorId) {
      clear();
      return null;
    }
    if (pending.boundActorId == actorId) return pending;
    final bound = PublicReturnIntent._(
      target: pending.target,
      action: pending.action,
      id: pending.id,
      issuedAt: pending.issuedAt,
      boundActorId: actorId,
    );
    _pending = bound;
    return bound;
  }

  PublicReturnIntent? consumePublic(Uri uri, {required String actorId}) {
    final parsed = _parse(uri, auth: false);
    final pending = _pending;
    if (parsed == null ||
        pending == null ||
        !_matches(parsed, pending) ||
        _expired(pending) ||
        pending.boundActorId != actorId) {
      clear();
      return null;
    }
    clear();
    return pending;
  }

  void clear() => _pending = null;

  bool _expired(PublicReturnIntent intent) {
    final age = _clock().toUtc().difference(intent.issuedAt);
    return age.isNegative || age > lifetime;
  }

  bool _matches(PublicReturnIntent candidate, PublicReturnIntent pending) =>
      candidate.target == pending.target &&
      candidate.action == pending.action &&
      candidate.id == pending.id &&
      candidate.issuedAt == pending.issuedAt;

  PublicReturnIntent? _parse(Uri uri, {required bool auth}) {
    const authKeys = {'returnTo', 'action', 'intentId', 'issuedAt', 'origin'};
    const publicKeys = {'action', 'intentId', 'issuedAt', 'origin'};
    final expected = auth ? authKeys : publicKeys;
    if (uri.queryParameters.length != expected.length ||
        !uri.queryParameters.keys.toSet().containsAll(expected) ||
        uri.queryParameters['origin'] != 'anonymous') {
      return null;
    }
    final target = auth ? uri.queryParameters['returnTo'] : uri.path;
    final action = PublicActionIntent.parse(uri.queryParameters['action']);
    final id = uri.queryParameters['intentId'];
    final issuedAtMillis = int.tryParse(uri.queryParameters['issuedAt'] ?? '');
    if (target == null ||
        action == null ||
        id == null ||
        !RegExp(r'^[0-9a-f]{48}$').hasMatch(id) ||
        issuedAtMillis == null ||
        !PublicReturnIntent.isPublicTarget(target) ||
        !PublicReturnIntent.matchesTarget(target, action)) {
      return null;
    }
    return PublicReturnIntent._(
      target: target,
      action: action,
      id: id,
      issuedAt: DateTime.fromMillisecondsSinceEpoch(
        issuedAtMillis,
        isUtc: true,
      ),
      boundActorId: null,
    );
  }
}

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
  const PublicReturnIntent({required this.target, required this.action});

  final String target;
  final PublicActionIntent action;

  static final _profile = RegExp(r'^/u/[a-zA-Z0-9_]{2,32}$');
  static final _post = RegExp(r'^/posts/[A-Za-z0-9_-]{1,128}$');

  static bool isPublicTarget(String target) =>
      !target.contains('?') &&
      !target.contains('#') &&
      (_profile.hasMatch(target) || _post.hasMatch(target));

  static bool _matchesTarget(String target, PublicActionIntent action) =>
      switch (action) {
        PublicActionIntent.friendRequest ||
        PublicActionIntent.messageRequest => _profile.hasMatch(target),
        PublicActionIntent.like ||
        PublicActionIntent.comment => _post.hasMatch(target),
      };

  static PublicReturnIntent? fromAuthUri(Uri uri) {
    final target = uri.queryParameters['returnTo'];
    final action = PublicActionIntent.parse(uri.queryParameters['action']);
    if (target == null ||
        action == null ||
        !isPublicTarget(target) ||
        !_matchesTarget(target, action)) {
      return null;
    }
    return PublicReturnIntent(target: target, action: action);
  }

  static PublicReturnIntent? fromPublicUri(Uri uri) {
    if (!isPublicTarget(uri.path)) {
      return null;
    }
    final action = PublicActionIntent.parse(uri.queryParameters['action']);
    if (action == null || !_matchesTarget(uri.path, action)) {
      return null;
    }
    return PublicReturnIntent(target: uri.path, action: action);
  }

  String get authLocation => Uri(
    path: '/sign-in',
    queryParameters: {'returnTo': target, 'action': action.value},
  ).toString();

  String get returnLocation =>
      Uri(path: target, queryParameters: {'action': action.value}).toString();
}

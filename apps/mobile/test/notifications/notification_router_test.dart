import 'dart:async';
import 'dart:convert';

import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/notifications/notification_event.dart';
import 'package:dayli_mobile/notifications/notification_router.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../support/fakes.dart';

class _Preflight implements NotificationPreflight {
  Completer<String>? deferred;
  final checked = <NotificationEvent>[];

  @override
  Future<bool> authorize(NotificationEvent event) async => true;

  @override
  Future<String> destination(NotificationEvent event) async {
    checked.add(event);
    if (deferred != null) return deferred!.future;
    return switch (event.kind) {
      NotificationKind.directMessage => '/messages/${event.targetId}',
      NotificationKind.friendRequest => '/friends',
      NotificationKind.finalHourReminder => '/post',
      NotificationKind.friendsPostRelease => '/',
    };
  }
}

Future<SessionController> _session() async {
  final tokens = MemoryTokenStore()..value = 'token';
  final session = SessionController(
    session: BetterAuthNativeSession(
      baseUrl: 'https://api.example.test',
      tokenStore: tokens,
      client: MockClient((request) async {
        if (request.url.path.endsWith('/get-session')) {
          return http.Response(
            jsonEncode({
              'user': {
                'id': 'alice',
                'name': 'Alice',
                'email': 'alice@example.test',
                'username': 'alice',
              },
            }),
            200,
          );
        }
        return http.Response('{}', 200);
      }),
    ),
    tokenStore: tokens,
    userCache: MemoryUserCache(),
    drafts: MemoryDraftStore(),
  );
  await session.restore();
  return session;
}

NotificationEvent _event(NotificationKind kind, String target) =>
    NotificationEvent(eventId: 'event-$target', kind: kind, targetId: target);

Future<void> _settle() async {
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

void main() {
  test('all approved kinds navigate only after preflight', () async {
    final session = await _session();
    final preflight = _Preflight();
    final routes = <String>[];
    final router = NotificationRouter(
      session: session,
      preflight: preflight,
      go: routes.add,
    );

    router.route(_event(NotificationKind.directMessage, 'conversation-1'));
    await _settle();
    router.route(_event(NotificationKind.friendRequest, 'request-1'));
    await _settle();
    router.route(_event(NotificationKind.finalHourReminder, '2026-10-04'));
    await _settle();
    router.route(_event(NotificationKind.friendsPostRelease, '2026-10-04'));
    await _settle();

    expect(routes, ['/messages/conversation-1', '/friends', '/post', '/']);
    expect(preflight.checked, hasLength(4));
    router.dispose();
  });

  test('logout during preflight prevents stale navigation', () async {
    final session = await _session();
    final preflight = _Preflight()..deferred = Completer<String>();
    final routes = <String>[];
    final router = NotificationRouter(
      session: session,
      preflight: preflight,
      go: routes.add,
    );

    router.route(_event(NotificationKind.directMessage, 'private-target'));
    await _settle();
    await session.signOut();
    preflight.deferred!.complete('/messages/private-target');
    await _settle();

    expect(routes, isEmpty);
    router.dispose();
  });

  test('a newer tap supersedes a deferred tap', () async {
    final session = await _session();
    final first = Completer<String>();
    final preflight = _Preflight()..deferred = first;
    final routes = <String>[];
    final router = NotificationRouter(
      session: session,
      preflight: preflight,
      go: routes.add,
    );

    router.route(_event(NotificationKind.directMessage, 'old'));
    await _settle();
    router.route(_event(NotificationKind.friendRequest, 'new'));
    preflight.deferred = null;
    first.complete('/messages/old');
    await _settle();
    // The queued latest tap starts after the first is discarded.
    await _settle();

    expect(routes, isNot(contains('/messages/old')));
    router.dispose();
  });
}

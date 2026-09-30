import 'package:dayli_mobile/api/feed_client.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/api/posting_day_client.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/drafts/draft_store.dart';
import 'package:dayli_mobile/messaging/messaging_client.dart';
import 'package:dayli_mobile/messaging/messaging_controller.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

const _offlineApiOrigin = String.fromEnvironment(
  'DAYLI_E2E_OFFLINE_API_BASE_URL',
  defaultValue: 'https://127.0.0.1:1',
);

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'reads bundled legal drafts offline and preserves an unsubmitted auth form',
    (tester) async {
      final storage = FlutterSecureStorage();
      final tokens = ProtectedSessionTokenStore(storage: storage);
      final users = ProtectedSessionUserCache(storage);
      final drafts = ProtectedDraftStore(storage: storage);
      await tokens.clear();
      await tokens.clearPendingRevocation();
      await users.clear();

      final nativeSession = BetterAuthNativeSession(
        baseUrl: _offlineApiOrigin,
        tokenStore: tokens,
      );
      final services = _actualServices(nativeSession, tokens, users, drafts);
      await tester.pumpWidget(
        DayliApp(services: services, useGoogleFonts: false),
      );
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('landing.sign-in')), findsOneWidget);
      await tester.tap(find.byKey(const Key('legal.openPrivacy')));
      await tester.pumpAndSettle();

      expect(find.text('Privacy Policy'), findsOneWidget);
      expect(find.byKey(const Key('legal.draftNotice')), findsOneWidget);
      expect(find.textContaining('agroupforcoders@gmail.com'), findsWidgets);
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('landing.sign-in')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('auth.email')),
        'reader@example.test',
      );
      await tester.tap(find.byKey(const Key('legal.openPrivacy')));
      await tester.pumpAndSettle();
      expect(find.text('Privacy Policy'), findsOneWidget);
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();

      expect(find.text('Welcome back'), findsOneWidget);
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('auth.email')))
            .controller!
            .text,
        'reader@example.test',
      );

      await tester.tap(find.byKey(const Key('legal.openTerms')));
      await tester.pumpAndSettle();
      expect(find.text('Terms of Service'), findsOneWidget);
      expect(find.text('Version: draft-2'), findsOneWidget);

      await tokens.clear();
      await tokens.clearPendingRevocation();
      await users.clear();
    },
  );
}

AppServices _actualServices(
  BetterAuthNativeSession nativeSession,
  ProtectedSessionTokenStore tokens,
  ProtectedSessionUserCache users,
  ProtectedDraftStore drafts,
) {
  final messaging = MessagingController(
    HttpMessagingClient(
      baseUrl: _offlineApiOrigin,
      bearerToken: nativeSession.bearerToken,
    ),
  );
  final session = SessionController(
    session: nativeSession,
    tokenStore: tokens,
    userCache: users,
    drafts: drafts,
    onSignedIn: (_) => messaging.startRealtime(),
    onPrivateDataClear: () async {
      await messaging.stopRealtime();
      messaging.clear();
    },
  );
  return AppServices(
    session: session,
    postingDays: GeneratedPostingDayClient(
      baseUrl: _offlineApiOrigin,
      bearerToken: nativeSession.bearerToken,
    ),
    feed: GeneratedFeedClient(
      baseUrl: _offlineApiOrigin,
      bearerToken: nativeSession.bearerToken,
    ),
    posts: GeneratedPostClient(
      baseUrl: _offlineApiOrigin,
      bearerToken: nativeSession.bearerToken,
    ),
    friends: GeneratedFriendsClient(
      baseUrl: _offlineApiOrigin,
      bearerToken: nativeSession.bearerToken,
    ),
    drafts: drafts,
    messaging: messaging,
    submitter: GeneratedPostSubmitter(
      baseUrl: _offlineApiOrigin,
      bearerToken: nativeSession.bearerToken,
    ),
  );
}

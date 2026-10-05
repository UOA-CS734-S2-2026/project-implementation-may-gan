import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_screens.dart';
import '../auth/public_return_intent.dart';
import '../auth/session_controller.dart';
import '../auth/username_setup_screen.dart';
import '../compose/composer_link.dart';
import '../compose/composer_screen.dart';
import '../friends/friends_screen.dart';
import '../friends/social_profile_screen.dart';
import '../home/home_screen.dart';
import '../landing/landing_screen.dart';
import '../legal/legal_acceptance_screen.dart';
import '../legal/legal_document_screen.dart';
import '../messaging/conversation_screen.dart';
import '../messaging/messages_screen.dart';
import '../messaging/new_message_screen.dart';
import '../posts/post_detail_screen.dart';
import '../profile/edit_profile_screen.dart';
import '../profile/my_days_screen.dart';
import '../settings/account_deletion_screen.dart';
import '../settings/account_export_screen.dart';
import '../settings/settings_screen.dart';
import '../settings/trash_screen.dart';
import '../shell/app_shell.dart';
import 'pending_destination.dart';
import 'splash_screen.dart';

const _publicLocations = {'/welcome', '/sign-in', '/sign-up'};
const _legalLocations = {'/privacy', '/terms'};

bool _isPublicContent(String location) =>
    location.startsWith('/u/') || location.startsWith('/posts/');

/// A public welcome and auth pages; signed-in tabs inside the shell; and the
/// composer and settings as full-screen pages above it.
GoRouter buildRouter(
  SessionController session, {
  String initialLocation = '/',
  PendingDestination? pending,
  ComposerLinkSequence? links,
}) {
  final waiting = pending ?? PendingDestination();
  final linkSequence = links ?? ComposerLinkSequence();
  PublicReturnIntent? presentedIntent;
  String? presentedLocation;

  PublicReturnIntent? takeIntent(GoRouterState state) {
    final actorId = session.user?.id;
    if (session.status != SessionStatus.signedIn || actorId == null) {
      presentedIntent = null;
      presentedLocation = null;
      return null;
    }
    final location = state.uri.toString();
    final fresh = session.consumePublicReturnIntent(state.uri);
    if (fresh != null) {
      presentedIntent = fresh;
      presentedLocation = location;
      return fresh;
    }
    if (presentedLocation == location &&
        presentedIntent?.boundActorId == actorId) {
      return presentedIntent;
    }
    presentedIntent = null;
    presentedLocation = null;
    return null;
  }

  return GoRouter(
    initialLocation: initialLocation,
    refreshListenable: session,
    redirect: (context, state) {
      final location = state.matchedLocation;
      final uri = state.uri;
      if (location == composerPath) {
        // Each link from outside the app is an event, even a repeat of the
        // last one.
        if (uri.scheme == composerLinkScheme) linkSequence.arrived();
        // Keep only a valid rating, and drop the custom scheme and host.
        final composer = composerLocation(uri);
        if (session.status != SessionStatus.signedIn) {
          waiting.remember(composer);
        } else if (uri.toString() != composer) {
          return composer;
        }
      } else if (uri.scheme == composerLinkScheme) {
        // An outside link can only open the composer.
        return '/';
      }
      if (_legalLocations.contains(location)) return null;
      if (location == '/legal/acceptance') {
        return switch (session.status) {
          SessionStatus.unknown => '/splash',
          SessionStatus.signedOut => '/welcome',
          SessionStatus.legalAcceptanceRequired ||
          SessionStatus.legalStatusUnavailable => null,
          SessionStatus.needsUsernameSetup => '/setup-username',
          SessionStatus.signedIn => '/',
        };
      }
      final public = _publicLocations.contains(location);
      final publicContent = _isPublicContent(location);
      final returnIntent =
          location == '/sign-in' ||
              location == '/sign-up' ||
              location == '/setup-username'
          ? session.resolvePublicReturnIntent(state.uri)
          : null;
      switch (session.status) {
        case SessionStatus.unknown:
          // Public deep links render while session restoration runs. Once the
          // actor is known, the screen refetches under that account.
          return publicContent || location == '/splash' ? null : '/splash';
        case SessionStatus.signedOut:
          return public || publicContent ? null : '/welcome';
        case SessionStatus.legalAcceptanceRequired:
        case SessionStatus.legalStatusUnavailable:
          if (location == '/account/export') return null;
          return '/legal/acceptance';
        case SessionStatus.needsUsernameSetup:
          if (location == '/account/export' ||
              location == '/account/deletion') {
            return null;
          }
          if (location == '/setup-username') {
            return null;
          }
          return returnIntent == null
              ? '/setup-username'
              : returnIntent.authLocation('/setup-username');
        case SessionStatus.signedIn:
          if (location == '/sign-in' ||
              location == '/sign-up' ||
              location == '/setup-username') {
            return returnIntent?.returnLocation ?? waiting.take() ?? '/';
          }
          if (location == '/splash' || public) return waiting.take() ?? '/';
          return null;
      }
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(
        path: '/privacy',
        builder: (_, _) => const LegalDocumentScreen(documentId: 'privacy'),
      ),
      GoRoute(
        path: '/terms',
        builder: (_, _) => const LegalDocumentScreen(documentId: 'terms'),
      ),
      GoRoute(path: '/welcome', builder: (_, _) => const LandingScreen()),
      GoRoute(
        path: '/sign-in',
        builder: (_, _) => const AuthScreen(mode: AuthMode.signIn),
      ),
      GoRoute(
        path: '/sign-up',
        builder: (_, _) => const AuthScreen(mode: AuthMode.signUp),
      ),
      GoRoute(
        path: '/setup-username',
        builder: (_, _) => const UsernameSetupScreen(),
      ),
      GoRoute(
        path: '/legal/acceptance',
        builder: (_, _) => const LegalAcceptanceScreen(),
      ),
      // Full-screen pages above the tabs.
      GoRoute(
        path: composerPath,
        // The composer can already be open when the same link arrives again,
        // so it rebuilds on each arrival, not only when the location changes.
        builder: (_, state) => ListenableBuilder(
          listenable: linkSequence,
          builder: (_, _) => ComposerScreen(
            initialRating: parsePrefilledRating(
              state.uri.queryParameters[composerRatingParameter],
            ),
            linkSequence: linkSequence.current,
          ),
        ),
      ),
      GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
      GoRoute(path: '/trash', builder: (_, _) => const TrashScreen()),
      GoRoute(
        path: '/account/export',
        builder: (_, _) => const AccountExportScreen(),
      ),
      GoRoute(
        path: '/account/deletion',
        builder: (_, _) => const AccountDeletionScreen(),
      ),
      GoRoute(
        path: '/profile/edit',
        builder: (_, _) => const EditProfileScreen(),
      ),
      GoRoute(
        path: '/posts/:id',
        builder: (_, state) {
          final intent = takeIntent(state);
          return PostDetailScreen(
            postId: state.pathParameters['id']!,
            intent: intent?.action,
            intentActorId: intent?.boundActorId,
          );
        },
      ),
      GoRoute(
        path: '/u/:username',
        builder: (_, state) {
          final intent = takeIntent(state);
          final profile = SocialProfileScreen(
            username: state.pathParameters['username']!,
            intent: intent?.action,
            intentActorId: intent?.boundActorId,
          );
          return session.status == SessionStatus.signedIn
              ? AppShell(location: state.matchedLocation, child: profile)
              : profile;
        },
      ),
      ShellRoute(
        builder: (_, state, child) =>
            AppShell(location: state.matchedLocation, child: child),
        routes: [
          GoRoute(path: '/', builder: (_, _) => const HomeScreen()),
          GoRoute(path: '/friends', builder: (_, _) => const FriendsScreen()),
          GoRoute(path: '/me', builder: (_, _) => const MyDaysScreen()),
          GoRoute(path: '/messages', builder: (_, _) => const MessagesScreen()),
          GoRoute(
            path: '/messages/new',
            builder: (_, _) => const MessagesScreen(),
          ),
          GoRoute(
            path: '/messages/new/:username',
            builder: (_, state) =>
                NewMessageScreen(username: state.pathParameters['username']!),
          ),
          GoRoute(
            path: '/messages/:id',
            builder: (_, state) =>
                ConversationScreen(conversationId: state.pathParameters['id']!),
          ),
        ],
      ),
    ],
  );
}

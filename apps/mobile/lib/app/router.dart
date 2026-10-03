import 'package:go_router/go_router.dart';

import '../auth/auth_screens.dart';
import '../auth/session_controller.dart';
import '../auth/username_setup_screen.dart';
import '../compose/composer_screen.dart';
import '../friends/friends_screen.dart';
import '../friends/social_profile_screen.dart';
import '../home/home_screen.dart';
import '../landing/landing_screen.dart';
import '../legal/legal_document_screen.dart';
import '../messaging/conversation_screen.dart';
import '../messaging/messages_screen.dart';
import '../messaging/new_message_screen.dart';
import '../posts/post_detail_screen.dart';
import '../profile/edit_profile_screen.dart';
import '../profile/my_days_screen.dart';
import '../settings/account_export_screen.dart';
import '../settings/settings_screen.dart';
import '../shell/app_shell.dart';
import 'splash_screen.dart';

const _publicLocations = {'/welcome', '/sign-in', '/sign-up'};
const _legalLocations = {'/privacy', '/terms'};

/// A public welcome and auth pages; signed-in tabs inside the shell; and the
/// composer and settings as full-screen pages above it.
GoRouter buildRouter(
  SessionController session, {
  String initialLocation = '/',
}) => GoRouter(
  initialLocation: initialLocation,
  refreshListenable: session,
  redirect: (context, state) {
    final location = state.matchedLocation;
    if (_legalLocations.contains(location)) return null;
    final public = _publicLocations.contains(location);
    switch (session.status) {
      case SessionStatus.unknown:
        return location == '/splash' ? null : '/splash';
      case SessionStatus.signedOut:
        return public ? null : '/welcome';
      case SessionStatus.needsUsernameSetup:
        return location == '/setup-username' || location == '/account/export'
            ? null
            : '/setup-username';
      case SessionStatus.signedIn:
        return public || location == '/splash' || location == '/setup-username'
            ? '/'
            : null;
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
    // Full-screen pages above the tabs.
    GoRoute(path: '/post', builder: (_, _) => const ComposerScreen()),
    GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
    GoRoute(
      path: '/account/export',
      builder: (_, _) => const AccountExportScreen(),
    ),
    GoRoute(
      path: '/profile/edit',
      builder: (_, _) => const EditProfileScreen(),
    ),
    GoRoute(
      path: '/posts/:id',
      builder: (_, state) =>
          PostDetailScreen(postId: state.pathParameters['id']!),
    ),
    ShellRoute(
      builder: (_, state, child) =>
          AppShell(location: state.matchedLocation, child: child),
      routes: [
        GoRoute(path: '/', builder: (_, _) => const HomeScreen()),
        GoRoute(path: '/friends', builder: (_, _) => const FriendsScreen()),
        GoRoute(
          path: '/u/:username',
          builder: (_, state) =>
              SocialProfileScreen(username: state.pathParameters['username']!),
        ),
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

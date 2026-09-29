import 'package:go_router/go_router.dart';

import '../auth/auth_screens.dart';
import '../auth/session_controller.dart';
import '../auth/username_setup_screen.dart';
import '../compose/composer_screen.dart';
import '../friends/friends_screen.dart';
import '../friends/social_profile_screen.dart';
import '../home/home_screen.dart';
import '../landing/landing_screen.dart';
import '../messaging/conversation_screen.dart';
import '../messaging/messages_screen.dart';
import '../messaging/new_message_screen.dart';
import '../placeholders/placeholder_screens.dart' show MyDaysScreen;
import '../settings/settings_screen.dart';
import '../shell/app_shell.dart';
import 'splash_screen.dart';

const _publicLocations = {'/welcome', '/sign-in', '/sign-up'};

/// A public welcome and auth pages; signed-in tabs inside the shell; and the
/// composer and settings as full-screen pages above it.
GoRouter buildRouter(SessionController session) => GoRouter(
  initialLocation: '/',
  refreshListenable: session,
  redirect: (context, state) {
    final location = state.matchedLocation;
    final public = _publicLocations.contains(location);
    switch (session.status) {
      case SessionStatus.unknown:
        return location == '/splash' ? null : '/splash';
      case SessionStatus.signedOut:
        return public ? null : '/welcome';
      case SessionStatus.needsUsernameSetup:
        return location == '/setup-username' ? null : '/setup-username';
      case SessionStatus.signedIn:
        return public || location == '/splash' || location == '/setup-username'
            ? '/'
            : null;
    }
  },
  routes: [
    GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
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
    ShellRoute(
      builder: (_, state, child) =>
          AppShell(location: state.matchedLocation, child: child),
      routes: [
        GoRoute(path: '/', builder: (_, _) => const HomeScreen()),
        GoRoute(path: '/friends', builder: (_, _) => const FriendsScreen()),
        GoRoute(
          path: '/people/:username',
          builder: (_, state) =>
              SocialProfileScreen(username: state.pathParameters['username']!),
        ),
        GoRoute(path: '/me', builder: (_, _) => const MyDaysScreen()),
        GoRoute(
          path: '/messages',
          builder: (_, state) => MessagesScreen(
            recipientId: state.uri.queryParameters['to'],
            recipientName: state.uri.queryParameters['name'],
          ),
        ),
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

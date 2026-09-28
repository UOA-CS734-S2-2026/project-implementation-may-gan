import 'package:go_router/go_router.dart';

import '../auth/auth_screens.dart';
import '../auth/session_controller.dart';
import '../compose/composer_screen.dart';
import '../home/home_screen.dart';
import '../landing/landing_screen.dart';
import '../legal/legal_document_screen.dart';
import '../placeholders/placeholder_screens.dart';
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
      case SessionStatus.signedIn:
        return public || location == '/splash' ? '/' : null;
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
    // Full-screen pages above the tabs.
    GoRoute(path: '/post', builder: (_, _) => const ComposerScreen()),
    GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
    ShellRoute(
      builder: (_, state, child) =>
          AppShell(location: state.matchedLocation, child: child),
      routes: [
        GoRoute(path: '/', builder: (_, _) => const HomeScreen()),
        GoRoute(path: '/friends', builder: (_, _) => const FriendsScreen()),
        GoRoute(path: '/me', builder: (_, _) => const MyDaysScreen()),
        GoRoute(path: '/messages', builder: (_, _) => const MessagesScreen()),
      ],
    ),
  ],
);

import 'package:go_router/go_router.dart';

import '../auth/auth_screens.dart';
import '../auth/session_controller.dart';
import '../compose/composer_screen.dart';
import '../home/home_screen.dart';
import '../landing/landing_screen.dart';
import '../placeholders/placeholder_screens.dart';
import '../settings/settings_screen.dart';
import '../shell/app_shell.dart';
import 'splash_screen.dart';

const _publicLocations = {'/welcome', '/sign-in', '/sign-up'};

/// WDCC's routes: a public landing and auth pages, and the signed-in pages
/// inside the navigation shell.
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
      case SessionStatus.signedIn:
        return public || location == '/splash' ? '/' : null;
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
    ShellRoute(
      builder: (_, state, child) =>
          AppShell(location: state.matchedLocation, child: child),
      routes: [
        GoRoute(path: '/', builder: (_, _) => const HomeScreen()),
        GoRoute(path: '/post', builder: (_, _) => const ComposerScreen()),
        GoRoute(path: '/friends', builder: (_, _) => const FriendsScreen()),
        GoRoute(path: '/me', builder: (_, _) => const MyDaysScreen()),
        GoRoute(path: '/messages', builder: (_, _) => const MessagesScreen()),
        GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
      ],
    ),
  ],
);

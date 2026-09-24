import 'package:go_router/go_router.dart';

import '../auth/auth_screens.dart';
import '../auth/session_controller.dart';
import '../compose/composer_screen.dart';
import '../home/today_screen.dart';
import '../settings/settings_screen.dart';
import '../shell/app_shell.dart';
import 'splash_screen.dart';

GoRouter buildRouter(SessionController session) => GoRouter(
  initialLocation: '/',
  refreshListenable: session,
  redirect: (context, state) {
    final location = state.matchedLocation;
    final onAuth = location == '/sign-in' || location == '/sign-up';
    switch (session.status) {
      case SessionStatus.unknown:
        return location == '/splash' ? null : '/splash';
      case SessionStatus.signedOut:
        return onAuth ? null : '/sign-in';
      case SessionStatus.signedIn:
        return onAuth || location == '/splash' ? '/' : null;
    }
  },
  routes: [
    GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
    GoRoute(
      path: '/sign-in',
      builder: (_, _) => const AuthScreen(mode: AuthMode.signIn),
    ),
    GoRoute(
      path: '/sign-up',
      builder: (_, _) => const AuthScreen(mode: AuthMode.signUp),
    ),
    GoRoute(path: '/compose', builder: (_, _) => const ComposerScreen()),
    StatefulShellRoute.indexedStack(
      builder: (_, _, navigationShell) =>
          AppShell(navigationShell: navigationShell),
      branches: [
        StatefulShellBranch(
          routes: [GoRoute(path: '/', builder: (_, _) => const TodayScreen())],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/settings',
              builder: (_, _) => const SettingsScreen(),
            ),
          ],
        ),
      ],
    ),
  ],
);

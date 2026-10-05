import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show PredictiveBackEvent;
import 'package:go_router/go_router.dart';

import '../auth/lock_screen.dart';
import '../notifications/notification_router.dart';
import 'app_scope.dart';
import 'router.dart';
import 'theme.dart';

class DayliApp extends StatefulWidget {
  const DayliApp({
    super.key,
    required this.services,
    this.useGoogleFonts = true,
    this.initialLocation = '/',
  });

  final AppServices services;
  final bool useGoogleFonts;
  final String initialLocation;

  @override
  State<DayliApp> createState() => _DayliAppState();
}

class _DayliAppState extends State<DayliApp> with WidgetsBindingObserver {
  late final GoRouter _router = buildRouter(
    widget.services.session,
    initialLocation: widget.initialLocation,
  );
  late final NotificationRouter? _notificationRouter =
      widget.services.notificationPreflight == null
      ? null
      : NotificationRouter(
          session: widget.services.session,
          preflight: widget.services.notificationPreflight!,
          go: _router.go,
        );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final notifications = widget.services.notifications;
    if (notifications != null) {
      final notificationRouter = _notificationRouter;
      if (notificationRouter != null) {
        notifications.setNotificationTapHandler(notificationRouter.route);
      }
      unawaited(notifications.start());
    }
    widget.services.session.restore();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final biometric = widget.services.biometric;
    switch (state) {
      case AppLifecycleState.resumed:
        biometric.reveal();
        widget.services.session.refreshAccountPolicyOnForeground();
        unawaited(widget.services.messaging.foreground());
      case AppLifecycleState.inactive:
        // Also sent while the system authentication prompt is open; the
        // service ignores it then.
        biometric.obscure();
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
        // Locks even while a prompt is open, so leaving a confirmation prompt
        // behind the home screen can't keep the app unlocked.
        biometric.lockForBackground();
      case AppLifecycleState.detached:
        break;
    }
  }

  // The lock screen sits above the router's Navigator, so a PopScope there
  // has no route to guard. Consume system back here instead, before the
  // router can pop a hidden page or close the app.
  @override
  Future<bool> didPopRoute() async => widget.services.biometric.isLocked;

  @override
  bool handleStartBackGesture(PredictiveBackEvent backEvent) =>
      widget.services.biometric.isLocked;

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(widget.services.messaging.stopRealtime());
    _notificationRouter?.dispose();
    final notifications = widget.services.notifications;
    if (notifications != null) unawaited(notifications.stop());
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppScope(
    services: widget.services,
    child: MaterialApp.router(
      title: 'Dayli',
      theme: buildDayliTheme(useGoogleFonts: widget.useGoogleFonts),
      routerConfig: _router,
      builder: (context, child) => ListenableBuilder(
        listenable: widget.services.biometric,
        builder: (context, _) {
          final biometric = widget.services.biometric;
          final locked = biometric.isLocked;
          final shielded = !locked && biometric.isObscured;
          return Stack(
            children: [
              if (child != null)
                // Covered content must not reach screen readers or keep
                // keyboard focus behind the lock.
                ExcludeSemantics(
                  excluding: locked || shielded,
                  child: ExcludeFocus(excluding: locked, child: child),
                ),
              if (locked)
                // A new key after each background trip prompts again.
                LockScreen(key: ValueKey(biometric.lockGeneration))
              else if (shielded)
                const PrivacyShield(),
            ],
          );
        },
      ),
    ),
  );
}

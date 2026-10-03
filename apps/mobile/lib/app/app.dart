import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'app_scope.dart';
import '../auth/lock_screen.dart';
import '../notifications/notification_router.dart';
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
  late final NotificationRouter _notificationRouter = NotificationRouter(
    session: widget.services.session,
    go: _router.go,
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final notifications = widget.services.notifications;
    if (notifications != null) {
      notifications.setNotificationTapHandler(
        _notificationRouter.routeConversation,
      );
      unawaited(notifications.start());
    }
    widget.services.session.restore();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(widget.services.messaging.foreground());
    } else if (state == AppLifecycleState.paused) {
      widget.services.biometric.lock();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(widget.services.messaging.stopRealtime());
    _notificationRouter.dispose();
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
        builder: (context, _) => Stack(
          children: [
            if (child != null) child,
            if (widget.services.biometric.isLocked)
              const LockScreen(),
          ],
        ),
      ),
    ),
  );
}

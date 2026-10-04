import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'app_scope.dart';
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
    if (state == AppLifecycleState.resumed) {
      unawaited(widget.services.messaging.foreground());
    }
  }

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
    ),
  );
}

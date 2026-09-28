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
  });

  final AppServices services;
  final bool useGoogleFonts;

  @override
  State<DayliApp> createState() => _DayliAppState();
}

class _DayliAppState extends State<DayliApp> with WidgetsBindingObserver {
  late final GoRouter _router = buildRouter(widget.services.session);
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
      unawaited(widget.services.messaging.resumeRealtime());
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
    ),
  );
}

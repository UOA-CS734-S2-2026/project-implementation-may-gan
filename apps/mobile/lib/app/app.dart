import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'app_scope.dart';
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

class _DayliAppState extends State<DayliApp> {
  late final GoRouter _router = buildRouter(widget.services.session);

  @override
  void initState() {
    super.initState();
    widget.services.session.restore();
  }

  @override
  void dispose() {
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

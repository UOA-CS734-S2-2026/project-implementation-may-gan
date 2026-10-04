import '../auth/session_controller.dart';

/// Coordinates session-bound services so one cleanup failure cannot leave a
/// socket or in-memory messaging data behind. A cleanup error is rethrown only
/// after every local cleanup attempt has run, allowing credential replacement
/// to fail closed while normal sign-out can still revoke the server session.
class SessionIntegrations {
  SessionIntegrations({
    required this.startRealtime,
    required this.stopRealtime,
    required this.clearMessaging,
    this.startPush,
    this.stopPush,
  });

  final Future<void> Function() startRealtime;
  final Future<void> Function() stopRealtime;
  final void Function() clearMessaging;
  final void Function(SessionStartup startup)? startPush;
  final Future<void> Function()? stopPush;

  Future<void> start(SessionStartup startup) async {
    if (!startup.isCurrent) return;
    await startRealtime();
    if (!startup.isCurrent) return;
    startPush?.call(startup);
  }

  Future<void> clear() async {
    Object? failure;
    StackTrace? stackTrace;

    Future<void> attempt(Future<void> Function() operation) async {
      try {
        await operation();
      } catch (error, trace) {
        failure ??= error;
        stackTrace ??= trace;
      }
    }

    await attempt(() async {
      await stopPush?.call();
    });
    await attempt(stopRealtime);
    try {
      clearMessaging();
    } catch (error, trace) {
      failure ??= error;
      stackTrace ??= trace;
    }
    if (failure != null) Error.throwWithStackTrace(failure!, stackTrace!);
  }
}

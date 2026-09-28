import 'package:flutter/widgets.dart';

import '../api/friends_client.dart';
import '../api/posting_day_client.dart';
import '../auth/native_session.dart';
import '../auth/session_controller.dart';
import '../compose/media_picker.dart';
import '../drafts/draft_store.dart';
import '../posts/post_submitter.dart';

/// Application-wide services, provided once above the router.
class AppServices {
  const AppServices({
    required this.session,
    required this.postingDays,
    required this.friends,
    required this.drafts,
    required this.submitter,
    this.google,
    this.mediaPicker = const DeviceMediaPicker(),
    this.clock = DateTime.now,
  });

  final SessionController session;
  final PostingDayClient postingDays;
  final FriendsClient friends;
  final DraftStore drafts;
  final DailyPostSubmitter submitter;

  /// Null when this build has no Google client ID configured.
  final GoogleIdTokenProvider? google;
  final MediaPicker mediaPicker;
  final DateTime Function() clock;
}

class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.services, required super.child});

  final AppServices services;

  static AppServices of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope is missing above this widget.');
    return scope!.services;
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) => services != oldWidget.services;
}

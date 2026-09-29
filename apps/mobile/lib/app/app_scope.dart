import 'package:flutter/widgets.dart';

import '../api/feed_client.dart';
import '../api/friends_client.dart';
import '../api/posting_day_client.dart';
import '../auth/native_session.dart';
import '../auth/session_controller.dart';
import '../compose/media_picker.dart';
import '../drafts/draft_store.dart';
import '../messaging/messaging_client.dart';
import '../messaging/messaging_controller.dart';
import '../notifications/firebase_push_source.dart';
import '../posts/post_submitter.dart';

/// Application-wide services, provided once above the router.
class AppServices {
  AppServices({
    required this.session,
    required this.postingDays,
    required this.feed,
    required this.friends,
    required this.drafts,
    required this.submitter,
    MessagingController? messaging,
    this.notifications,
    this.google,
    this.mediaPicker = const DeviceMediaPicker(),
    this.clock = DateTime.now,
  }) : messaging =
           messaging ?? MessagingController(const UnavailableMessagingClient());

  final SessionController session;
  final PostingDayClient postingDays;
  final FeedClient feed;
  final FriendsClient friends;
  final DraftStore drafts;
  final DailyPostSubmitter submitter;
  final MessagingController messaging;
  final FirebasePushLifecycle? notifications;

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

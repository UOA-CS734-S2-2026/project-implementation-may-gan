import 'package:flutter/widgets.dart';

import '../api/feed_client.dart';
import '../api/friends_client.dart';
import '../api/media_upload_client.dart';
import '../api/post_client.dart';
import '../api/posting_day_client.dart';
import '../api/profile_client.dart';
import '../auth/native_session.dart';
import '../auth/session_controller.dart';
import '../compose/media_compressor.dart';
import '../compose/media_picker.dart';
import '../compose/pending_capture.dart';
import '../compose/voice_recorder.dart';
import '../drafts/draft_store.dart';
import '../messaging/messaging_client.dart';
import '../messaging/messaging_controller.dart';
import '../notifications/firebase_push_source.dart';
import '../posts/post_submitter.dart';
import '../settings/account_export_client.dart';

/// Application-wide services, provided once above the router.
class AppServices {
  AppServices({
    required this.session,
    required this.postingDays,
    required this.feed,
    required this.posts,
    required this.friends,
    required this.drafts,
    required this.submitter,
    MessagingController? messaging,
    this.profiles = const UnavailableProfileClient(),
    this.notifications,
    this.accountExports,
    this.google,
    this.mediaPicker = const DeviceMediaPicker(),
    PendingCaptures? pendingCaptures,
    this.voiceMemos = const VoiceMemoServices(),
    this.mediaUploads,
    MediaCompressor? mediaCompressor,
    this.clock = DateTime.now,
  }) : messaging =
           messaging ?? MessagingController(const UnavailableMessagingClient()),
       mediaCompressor = mediaCompressor ?? DeviceMediaCompressor(),
       pendingCaptures = pendingCaptures ?? PendingCaptures();

  final SessionController session;
  final PostingDayClient postingDays;
  final FeedClient feed;
  final PostClient posts;
  final FriendsClient friends;
  final DraftStore drafts;
  final DailyPostSubmitter submitter;
  final MessagingController messaging;
  final ProfileClient profiles;
  final FirebasePushLifecycle? notifications;

  /// Null until export provider proof and an explicit release decision.
  final AccountExportClient? accountExports;

  /// Null when this build has no Google client ID configured.
  final GoogleIdTokenProvider? google;
  final MediaPicker mediaPicker;

  /// Which user and draft a camera or library pick belongs to, so a photo
  /// recovered after Android ended the app only reaches its own composer.
  final PendingCaptures pendingCaptures;

  /// Recording a voice memo: the microphone, its permission, and where the
  /// recording is written.
  final VoiceMemoServices voiceMemos;

  /// Null keeps picked media on the device without uploading it.
  final MediaUploadClient? mediaUploads;
  final MediaCompressor mediaCompressor;
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

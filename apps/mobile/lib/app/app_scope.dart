import 'package:flutter/widgets.dart';

import '../api/feed_client.dart';
import '../api/friends_client.dart';
import '../api/interactions_client.dart';
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
import '../notifications/notification_consent.dart';
import '../notifications/notification_router.dart';
import '../posts/post_activity.dart';
import '../posts/post_submitter.dart';
import '../auth/biometric_service.dart';
import '../profile/streak_cache.dart';
import '../settings/account_export_client.dart';
import '../weather/weather_lookup.dart';

/// Application-wide services, provided once above the router.
class AppServices {
  AppServices({
    required this.session,
    required this.postingDays,
    required this.feed,
    required this._posts,
    required this.friends,
    required this.drafts,
    required this._submitter,
    required this.biometric,
    MessagingController? messaging,
    this.profiles = const UnavailableProfileClient(),
    this.interactions = const UnavailableInteractionsClient(),
    this.notifications,
    this.notificationConsent,
    this.notificationPreflight,
    this.accountExports,
    this.google,
    this.mediaPicker = const DeviceMediaPicker(),
    PendingCaptures? pendingCaptures,
    this.voiceMemos = const VoiceMemoServices(),
    this.weather = const WeatherServices(),
    this.mediaUploads,
    MediaCompressor? mediaCompressor,
    StreakCache? streakCache,
    PostActivity? postActivity,
    this.clock = DateTime.now,
  }) : streakCache = streakCache ?? MemoryStreakCache(),
       postActivity = postActivity ?? PostActivity(),
       messaging =
           messaging ?? MessagingController(const UnavailableMessagingClient()),
       mediaCompressor = mediaCompressor ?? DeviceMediaCompressor(),
       pendingCaptures = pendingCaptures ?? PendingCaptures();

  final SessionController session;
  final PostingDayClient postingDays;
  final FeedClient feed;
  final PostClient _posts;

  /// Reports confirmed Trash changes to [postActivity].
  late final PostClient posts = ReportingPostClient(_posts, postActivity);
  late final PostTrashClient postTrash = _posts is PostTrashClient
      ? ReportingPostTrashClient(_posts as PostTrashClient, postActivity)
      : const UnavailablePostTrashClient();
  final FriendsClient friends;
  final DraftStore drafts;
  final DailyPostSubmitter _submitter;

  /// Reports accepted posts to [postActivity].
  late final DailyPostSubmitter submitter = ReportingPostSubmitter(
    _submitter,
    postActivity,
  );
  final MessagingController messaging;
  final ProfileClient profiles;
  final InteractionsClient interactions;
  final FirebasePushLifecycle? notifications;
  final NotificationConsentController? notificationConsent;
  final NotificationPreflight? notificationPreflight;

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

  /// Adding weather to a post: the weather provider, the phone's location, and
  /// its place lookup.
  final WeatherServices weather;

  /// Null keeps picked media on the device without uploading it.
  final MediaUploadClient? mediaUploads;
  final MediaCompressor mediaCompressor;

  /// The owner's last confirmed streak, for showing offline.
  final StreakCache streakCache;

  /// Fires when the server accepts or deletes one of the user's posts.
  final PostActivity postActivity;
  final DateTime Function() clock;
  final BiometricService biometric;
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

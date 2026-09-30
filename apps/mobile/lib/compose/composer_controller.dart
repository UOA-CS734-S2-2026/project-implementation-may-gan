import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../api/api_failure.dart';
import '../api/posting_day_client.dart';
import '../drafts/daily_post_draft.dart';
import '../drafts/draft_store.dart';
import '../posts/post_submitter.dart';

/// Limits mirror the server contract (docs/dayli/daily-posts.md). The API
/// remains authoritative.
abstract final class DailyPostLimits {
  static const ratingMin = 1;
  static const ratingMax = 10;
  static const reflectiveAnswerMax = 4000;
  static const captionMax = 1000;
  static const tomorrowNoteMax = 1000;

  /// WDCC's media rule: up to three photos, or one video.
  static const photosMax = 3;

  /// Per attachment, after compression. Matches the API's
  /// `MAX_ATTACHMENT_BYTES`, which allows exactly this size.
  static const attachmentBytesMax = 10 * 1024 * 1024;

  /// Per post. Enforced here only: the API can't check it until posts link
  /// their attachments.
  static const postBytesMax = 25 * 1024 * 1024;

  /// Matches the API's `MAX_VIDEO_DURATION_SECONDS`, which allows exactly
  /// this length.
  static const videoDurationMax = Duration(seconds: 15);
}

/// Why a picked attachment can't be added to the draft.
enum MediaLimitViolation {
  empty('That file is empty. Choose another.'),
  attachmentTooLarge('Each photo or video must be 10 MB or smaller.'),
  postTooLarge('Photos in one dayli must add up to 25 MB or less.'),
  videoTooLong('Videos can be up to 15 seconds long.');

  const MediaLimitViolation(this.message);

  final String message;
}

/// Checks one compressed attachment against the per-file limits and, with
/// [otherBytes] (the sizes already in the draft), the per-post total.
/// [videoDuration] is required for videos and ignored for photos.
MediaLimitViolation? checkAttachmentLimits({
  required String mediaType,
  required int byteSize,
  Iterable<int> otherBytes = const [],
  Duration? videoDuration,
}) {
  if (byteSize <= 0) return MediaLimitViolation.empty;
  if (byteSize > DailyPostLimits.attachmentBytesMax) {
    return MediaLimitViolation.attachmentTooLarge;
  }
  if (mediaType == 'video' &&
      (videoDuration == null ||
          videoDuration > DailyPostLimits.videoDurationMax)) {
    return MediaLimitViolation.videoTooLong;
  }
  final total = otherBytes.fold(byteSize, (sum, bytes) => sum + bytes);
  if (total > DailyPostLimits.postBytesMax) {
    return MediaLimitViolation.postTooLarge;
  }
  return null;
}

/// True when the draft can take another attachment: fewer than three photos
/// and no video. Removing every photo lets the first slot take a video again.
bool canAddAttachment(List<DraftAttachment> attachments) =>
    attachments.length < DailyPostLimits.photosMax &&
    !attachments.any((attachment) => attachment.mediaType == 'video');

int codePointLength(String value) => value.runes.length;

enum ComposerPhase {
  loading,

  /// The draft can be edited and submitted.
  editing,

  /// Today's post has been accepted.
  posted,

  /// A saved draft belongs to an Auckland day that has ended. It can be read
  /// or discarded but never backdated.
  missedDeadline,

  /// Today already has a post, but this device still holds unposted words,
  /// for example edits made after an earlier attempt was accepted. They can
  /// be read or discarded.
  alreadyPosted,

  /// Neither the server nor a saved draft is available.
  unavailable,
}

class ComposerFieldErrors {
  const ComposerFieldErrors({
    this.audience,
    this.rating,
    this.reflectiveAnswer,
    this.caption,
    this.tomorrowNote,
    this.media,
  });

  final String? audience;
  final String? rating;
  final String? reflectiveAnswer;
  final String? caption;
  final String? tomorrowNote;
  final String? media;

  bool get isEmpty =>
      audience == null &&
      rating == null &&
      reflectiveAnswer == null &&
      caption == null &&
      tomorrowNote == null &&
      media == null;
}

/// With [requireUploadedMedia], every attachment must have passed the
/// server's checks before posting.
ComposerFieldErrors validateDraft(
  DailyPostDraft draft, {
  bool requireUploadedMedia = false,
}) {
  final answer = draft.reflectiveAnswer.trim();
  final rating = draft.rating;
  return ComposerFieldErrors(
    audience: draft.audience == null ? 'Choose who can see this dayli' : null,
    rating:
        rating == null ||
            rating < DailyPostLimits.ratingMin ||
            rating > DailyPostLimits.ratingMax
        ? 'Rating must be between 1 and 10'
        : null,
    reflectiveAnswer: answer.isEmpty
        ? 'Please respond to the daily prompt'
        : codePointLength(answer) > DailyPostLimits.reflectiveAnswerMax
        ? 'Keep your response under ${DailyPostLimits.reflectiveAnswerMax} characters.'
        : null,
    caption: codePointLength(draft.caption.trim()) > DailyPostLimits.captionMax
        ? 'Keep your word dump under ${DailyPostLimits.captionMax} characters.'
        : null,
    tomorrowNote:
        codePointLength(draft.tomorrowNote.trim()) >
            DailyPostLimits.tomorrowNoteMax
        ? 'Keep your note under ${DailyPostLimits.tomorrowNoteMax} characters.'
        : null,
    media: requireUploadedMedia ? _mediaError(draft.attachments) : null,
  );
}

String? _mediaError(List<DraftAttachment> attachments) {
  if (attachments.any((a) => a.status == AttachmentUploadStatus.failed)) {
    return "Remove the photos or videos that couldn't be uploaded.";
  }
  if (attachments.any((a) => a.status != AttachmentUploadStatus.validated)) {
    return 'Wait for your photos and videos to finish uploading.';
  }
  return null;
}

/// A random RFC 4122 version-4 UUID for idempotency keys.
String generateIdempotencyKey([Random? random]) {
  final source = random ?? Random.secure();
  final bytes = List<int>.generate(16, (_) => source.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// Owns one author's daily draft: loads it from protected storage, saves every
/// edit, and submits it without ever discarding unsent words.
class ComposerController extends ChangeNotifier {
  ComposerController({
    required this.userId,
    required this._postingDays,
    required this._drafts,
    required this._submitter,
    required this._onUnauthenticated,
    DateTime Function()? clock,
    String Function()? newIdempotencyKey,
    this.saveDelay = const Duration(milliseconds: 400),
    this.requireUploadedMedia = false,
  }) : _clock = clock ?? DateTime.now,
       _newKey = newIdempotencyKey ?? generateIdempotencyKey;

  final String userId;
  final Duration saveDelay;

  /// Set when this build uploads media, so a dayli can't be posted while an
  /// attachment is still uploading or was rejected.
  final bool requireUploadedMedia;
  final PostingDayClient _postingDays;
  final DraftStore _drafts;
  final DailyPostSubmitter _submitter;
  final VoidCallback _onUnauthenticated;
  final DateTime Function() _clock;
  final String Function() _newKey;

  ComposerPhase _phase = ComposerPhase.loading;
  PostingDay? _day;
  DailyPostDraft? _draft;
  bool _offline = false;
  bool _submitting = false;

  /// Set when the deadline passed while a submission was in flight, so the
  /// day is rechecked once it settles.
  bool _deadlinePassedWhileSubmitting = false;
  bool _draftWasDiscarded = false;
  String? _message;
  ComposerFieldErrors _errors = const ComposerFieldErrors();
  Timer? _saveTimer;
  Timer? _deadlineTimer;
  Future<void> _pendingSave = Future.value();
  bool _disposed = false;

  ComposerPhase get phase => _phase;
  PostingDay? get day => _day;
  DailyPostDraft? get draft => _draft;
  bool get offline => _offline;
  bool get submitting => _submitting;

  /// True when a stored draft could not be unlocked and had to be removed.
  bool get draftWasDiscarded => _draftWasDiscarded;
  String? get message => _message;
  ComposerFieldErrors get errors => _errors;

  Future<void> load() async {
    _deadlineTimer?.cancel();
    _deadlinePassedWhileSubmitting = false;
    _phase = ComposerPhase.loading;
    _message = null;
    _notify();

    final stored = await _drafts.read(userId);
    _draftWasDiscarded = stored.discarded;
    final saved = stored.draft;
    final result = await _postingDays.current();

    switch (result) {
      case ApiSuccess(value: final day):
        _offline = false;
        _day = day;
        if (saved != null && saved.localDate != day.localDate) {
          _draft = saved;
          _phase = ComposerPhase.missedDeadline;
        } else if (day.hasPosted) {
          if (saved != null && saved.isEmpty) await _drafts.clear(userId);
          // Unposted words for a day that already has a post are kept until
          // the author discards them.
          _draft = saved == null || saved.isEmpty ? null : saved;
          _phase = _draft == null
              ? ComposerPhase.posted
              : ComposerPhase.alreadyPosted;
        } else {
          _draft = _forDay(saved, day);
          _phase = ComposerPhase.editing;
          _scheduleDeadlineCheck(day);
        }
      case ApiError(failure: Unauthenticated()):
        _onUnauthenticated();
        return;
      case ApiError(:final failure):
        _offline = failure is NetworkUnavailable;
        if (saved != null) {
          // Keep drafting offline; the server decides eligibility on submit.
          _draft = saved;
          _phase = ComposerPhase.editing;
        } else {
          _phase = ComposerPhase.unavailable;
          _message = _offline
              ? "You're offline. Connect to load today's prompt."
              : "Today's prompt couldn't be loaded. Try again shortly.";
        }
    }
    _notify();
  }

  /// Applies an edit and saves it to protected storage shortly afterwards.
  /// Edits are ignored while a submission is in flight, so the draft always
  /// matches what was sent and an accepted post never discards later words.
  void update({
    String? reflectiveAnswer,
    String? caption,
    int? Function()? rating,
    PostAudience? audience,
    String? tomorrowNote,
    List<DraftAttachment>? attachments,
  }) {
    final current = _draft;
    if (current == null || _submitting || _phase != ComposerPhase.editing) {
      return;
    }
    _draft = current.copyWith(
      reflectiveAnswer: reflectiveAnswer,
      caption: caption,
      rating: rating,
      audience: audience,
      tomorrowNote: tomorrowNote,
      attachments: attachments,
      updatedAt: _clock(),
    );
    _message = null;
    _clearFixedErrors(_draft!);
    _scheduleSave();
    _notify();
  }

  /// Records upload progress on one attachment. Unlike [update] this isn't an
  /// author edit, so it also applies while a submission is in flight. Returns
  /// false when [previous] is no longer in the draft, for example because the
  /// author removed it.
  bool replaceAttachment(DraftAttachment previous, DraftAttachment next) =>
      _editAttachments(previous, (attachments, index) {
        attachments[index] = next;
      });

  /// Drops an attachment that can't be uploaded, such as a video over the
  /// length limit. Returns false when it is already gone.
  bool removeAttachment(DraftAttachment attachment) =>
      _editAttachments(attachment, (attachments, index) {
        attachments.removeAt(index);
      });

  bool _editAttachments(
    DraftAttachment target,
    void Function(List<DraftAttachment> attachments, int index) edit,
  ) {
    final current = _draft;
    if (current == null || _phase != ComposerPhase.editing) return false;
    final attachments = [...current.attachments];
    final index = attachments.indexOf(target);
    if (index < 0) return false;
    edit(attachments, index);
    _draft = current.copyWith(attachments: attachments, updatedAt: _clock());
    // Lets "wait for uploads" clear itself once the last upload passes.
    _clearFixedErrors(_draft!);
    _scheduleSave();
    _notify();
    return true;
  }

  /// Clears each shown error once its field is valid, without raising new
  /// errors while the author is still typing.
  void _clearFixedErrors(DailyPostDraft draft) {
    if (_errors.isEmpty) return;
    final next = validateDraft(
      draft,
      requireUploadedMedia: requireUploadedMedia,
    );
    _errors = ComposerFieldErrors(
      audience: _errors.audience == null ? null : next.audience,
      rating: _errors.rating == null ? null : next.rating,
      reflectiveAnswer: _errors.reflectiveAnswer == null
          ? null
          : next.reflectiveAnswer,
      caption: _errors.caption == null ? null : next.caption,
      tomorrowNote: _errors.tomorrowNote == null ? null : next.tomorrowNote,
      media: _errors.media == null ? null : next.media,
    );
  }

  /// Removes a draft that can no longer be posted and starts today's.
  Future<void> discardDraft() async {
    await _drafts.clear(userId);
    _draft = null;
    await load();
  }

  Future<void> submit() async {
    final current = _draft;
    if (current == null || _submitting || _phase != ComposerPhase.editing) {
      return;
    }
    _errors = validateDraft(
      current,
      requireUploadedMedia: requireUploadedMedia,
    );
    if (!_errors.isEmpty) {
      _notify();
      return;
    }

    _submitting = true;
    _message = null;
    _notify();
    // Persist before sending so the words survive a crash mid-request.
    await _flushSave();

    final result = await _submitter.submit(current);
    _submitting = false;
    switch (result) {
      case SubmissionAccepted():
        await _drafts.clear(userId);
        _draft = null;
        _phase = ComposerPhase.posted;
      case SubmissionRejected(conflict: SubmissionConflict.postingDayClosed):
        _phase = ComposerPhase.missedDeadline;
        _message =
            "Today's posting window closed at midnight, so this dayli can't be "
            'posted. Your words are still saved on this device.';
      case SubmissionRejected(
        conflict: SubmissionConflict.promptChanged ||
            SubmissionConflict.postingDayNotOpen,
      ):
        await load();
        _message =
            "The day's prompt has changed. Check your answer and post again.";
      case SubmissionRejected(conflict: SubmissionConflict.alreadyPosted):
        _phase = ComposerPhase.alreadyPosted;
        _message =
            "Today's dayli was already posted, so this one can't be posted. "
            'Your words are still saved on this device.';
      case SubmissionRejected(
        conflict: SubmissionConflict.idempotencyKeyReused,
      ):
        _phase = ComposerPhase.alreadyPosted;
        _message =
            'An earlier version of this dayli was already posted, so these '
            "edits can't be posted. They're still saved on this device.";
      case SubmissionFailed(failure: Unauthenticated()):
        _message = 'Sign in again to post. Your dayli is saved on this device.';
        _onUnauthenticated();
      case SubmissionFailed(failure: NetworkUnavailable()):
        _message =
            "You're offline. Your dayli is saved on this device; try again "
            "when you're connected. It won't be posted twice.";
      case SubmissionFailed(failure: InvalidRequest(:final message)):
        _message = message;
      case SubmissionFailed():
        _message =
            "Posting isn't available right now. Your dayli is saved on this "
            'device; try again shortly.';
    }
    final signedOut =
        result is SubmissionFailed && result.failure is Unauthenticated;
    if (_deadlinePassedWhileSubmitting &&
        _phase == ComposerPhase.editing &&
        !signedOut) {
      // The request didn't settle the day, so recheck it now. Keep the
      // failure message if the day is still open.
      final failure = _message;
      await _flushSave();
      await load();
      if (_phase == ComposerPhase.editing) _message ??= failure;
    }
    _notify();
  }

  DailyPostDraft _forDay(DailyPostDraft? saved, PostingDay day) {
    if (saved == null) {
      return DailyPostDraft(
        userId: userId,
        localDate: day.localDate,
        promptId: day.promptId,
        promptText: day.promptText,
        idempotencyKey: _newKey(),
        updatedAt: _clock(),
      );
    }
    if (saved.promptId == day.promptId && saved.promptText == day.promptText) {
      return saved;
    }
    final refreshed = saved.copyWith(
      promptId: day.promptId,
      promptText: day.promptText,
    );
    _scheduleSave(refreshed);
    return refreshed;
  }

  /// Asks the server for the day again once its deadline passes, so an open
  /// composer shows the missed state instead of a countdown stuck at zero.
  /// The server remains authoritative; a submission already in flight is
  /// decided by the server's clock, not this timer.
  void _scheduleDeadlineCheck(PostingDay day) {
    _deadlineTimer?.cancel();
    var remaining = day.deadlineAt.difference(day.serverNow);
    if (remaining.isNegative) remaining = Duration.zero;
    _deadlineTimer = Timer(remaining + const Duration(seconds: 1), () {
      if (_disposed || _phase != ComposerPhase.editing) return;
      if (_submitting) {
        // submit() rechecks the day once the request settles.
        _deadlinePassedWhileSubmitting = true;
        return;
      }
      unawaited(_flushSave().then((_) => _disposed ? null : load()));
    });
  }

  void _scheduleSave([DailyPostDraft? draft]) {
    _saveTimer?.cancel();
    _saveTimer = Timer(saveDelay, () => _save(draft ?? _draft));
  }

  Future<void> _flushSave() async {
    if (_saveTimer?.isActive ?? false) {
      _saveTimer!.cancel();
      await _save(_draft);
    }
    await _pendingSave;
  }

  Future<void> _save(DailyPostDraft? draft) {
    if (draft == null) return _pendingSave;
    // Saves run in order so an older write never replaces a newer one.
    return _pendingSave = _pendingSave.then((_) => _drafts.write(draft));
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  /// Saves any pending edit before the controller goes away.
  Future<void> close() => _flushSave();

  @override
  void dispose() {
    _disposed = true;
    _deadlineTimer?.cancel();
    if (_saveTimer?.isActive ?? false) {
      _saveTimer!.cancel();
      unawaited(_save(_draft));
    }
    super.dispose();
  }
}

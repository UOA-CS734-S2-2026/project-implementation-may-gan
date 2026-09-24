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
}

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

  /// Neither the server nor a saved draft is available.
  unavailable,
}

class ComposerFieldErrors {
  const ComposerFieldErrors({
    this.rating,
    this.reflectiveAnswer,
    this.caption,
    this.tomorrowNote,
  });

  final String? rating;
  final String? reflectiveAnswer;
  final String? caption;
  final String? tomorrowNote;

  bool get isEmpty =>
      rating == null &&
      reflectiveAnswer == null &&
      caption == null &&
      tomorrowNote == null;
}

ComposerFieldErrors validateDraft(DailyPostDraft draft) {
  final answer = draft.reflectiveAnswer.trim();
  final rating = draft.rating;
  return ComposerFieldErrors(
    rating:
        rating == null ||
            rating < DailyPostLimits.ratingMin ||
            rating > DailyPostLimits.ratingMax
        ? 'Rate your day from 1 to 10.'
        : null,
    reflectiveAnswer: answer.isEmpty
        ? 'Please respond to the daily prompt.'
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
  );
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
  }) : _clock = clock ?? DateTime.now,
       _newKey = newIdempotencyKey ?? generateIdempotencyKey;

  final String userId;
  final Duration saveDelay;
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
  bool _draftWasDiscarded = false;
  String? _message;
  ComposerFieldErrors _errors = const ComposerFieldErrors();
  Timer? _saveTimer;
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
        if (day.hasPosted) {
          if (saved != null && saved.localDate == day.localDate) {
            await _drafts.clear(userId);
          }
          _draft = saved != null && saved.localDate != day.localDate
              ? saved
              : null;
          _phase = _draft == null
              ? ComposerPhase.posted
              : ComposerPhase.missedDeadline;
        } else if (saved != null && saved.localDate != day.localDate) {
          _draft = saved;
          _phase = ComposerPhase.missedDeadline;
        } else {
          _draft = _forDay(saved, day);
          _phase = ComposerPhase.editing;
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
  void update({
    String? reflectiveAnswer,
    String? caption,
    int? Function()? rating,
    PostAudience? audience,
    String? tomorrowNote,
  }) {
    final current = _draft;
    if (current == null || _phase != ComposerPhase.editing) return;
    _draft = current.copyWith(
      reflectiveAnswer: reflectiveAnswer,
      caption: caption,
      rating: rating,
      audience: audience,
      tomorrowNote: tomorrowNote,
      updatedAt: _clock(),
    );
    _message = null;
    _scheduleSave();
    _notify();
  }

  /// Removes a draft that can no longer be posted and starts today's.
  Future<void> discardMissedDraft() async {
    await _drafts.clear(userId);
    _draft = null;
    await load();
  }

  Future<void> submit() async {
    final current = _draft;
    if (current == null || _submitting || _phase != ComposerPhase.editing) {
      return;
    }
    _errors = validateDraft(current);
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
      case SubmissionRejected(
        conflict: SubmissionConflict.alreadyPosted ||
            SubmissionConflict.idempotencyKeyReused,
      ):
        await _drafts.clear(userId);
        _draft = null;
        _phase = ComposerPhase.posted;
        _message = "You've already posted today's dayli.";
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
    if (_saveTimer?.isActive ?? false) {
      _saveTimer!.cancel();
      unawaited(_save(_draft));
    }
    super.dispose();
  }
}

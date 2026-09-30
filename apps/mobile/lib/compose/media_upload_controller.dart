import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../api/api_failure.dart';
import '../api/media_upload_client.dart';
import '../drafts/daily_post_draft.dart';
import 'composer_controller.dart';
import 'media_compressor.dart';

/// What the upload controller is doing to the attachment it is working on.
enum UploadActivity { compressing, uploading, checking }

enum _Outcome {
  /// The attachment moved on, or left the draft. Look for the next one.
  progressed,

  /// Something transient went wrong. Wait, then try again.
  retryLater,

  /// The session expired and has been handed to the sign-out flow. Retrying
  /// with the same session would only fail again, so wait for
  /// [MediaUploadController.retryNow].
  waitForSignIn,
}

/// Compresses and uploads the draft's attachments in the background, one at
/// a time, and records each step in the draft so an upload interrupted by a
/// restart picks up where it stopped.
///
/// The steps follow from each attachment's stored state:
/// no compressed copy → compress; no reservation → reserve; `uploading` →
/// upload with the ticket from this session, or, after a restart, ask the
/// server before uploading again. `validated` and `failed` are finished.
class MediaUploadController extends ChangeNotifier {
  MediaUploadController({
    required this._composer,
    required this._compressor,
    required this._client,
    required this._onUnauthenticated,
    this.retryBase = const Duration(seconds: 2),
    this.retryMax = const Duration(minutes: 1),
  });

  /// The first retry waits this long, doubling up to [retryMax].
  final Duration retryBase;
  final Duration retryMax;

  final ComposerController _composer;
  final MediaCompressor _compressor;
  final MediaUploadClient _client;

  /// Hands an expired session to the app's sign-out flow, as the composer
  /// does when a submission gets a 401.
  final VoidCallback _onUnauthenticated;

  /// Tickets exist only in memory: their URLs are short-lived credentials.
  final _tickets = <String, MediaUploadTicket>{};

  /// Compressed copies the draft referred to when last seen, so copies can
  /// be deleted once the draft stops referring to them.
  var _knownCopies = <String>{};

  /// Upload URLs that expired in a row, per compressed copy. A URL that keeps
  /// failing points at a bug, not a slow author.
  final _expiries = <String, int>{};

  DraftAttachment? _active;
  UploadActivity? _activity;
  String? _notice;
  String? _problem;
  var _running = false;
  var _failures = 0;
  var _waitingForSignIn = false;
  Timer? _retryTimer;
  var _disposed = false;

  /// The attachment being worked on, if any.
  DraftAttachment? get active => _active;
  UploadActivity? get activity => _activity;

  /// Why a picked file was dropped. Stays until [clearNotice].
  String? get notice => _notice;

  /// Why uploads are paused. Cleared once they make progress again.
  String? get problem => _problem;

  void start() {
    _composer.addListener(_onDraftChanged);
    _onDraftChanged();
  }

  void clearNotice() {
    if (_notice == null) return;
    _notice = null;
    _notify();
  }

  /// Retries now instead of waiting, for example after signing in again.
  void retryNow() {
    _retryTimer?.cancel();
    _retryTimer = null;
    _failures = 0;
    _waitingForSignIn = false;
    unawaited(_pump());
  }

  void _onDraftChanged() {
    if (_disposed) return;
    final attachments = _composer.draft?.attachments ?? const [];
    final copies = {
      for (final attachment in attachments)
        if (attachment.compressedPath case final path?) path,
    };
    for (final path in _knownCopies.difference(copies)) {
      _expiries.remove(path);
      unawaited(_compressor.discard(path));
    }
    _knownCopies = copies;
    if (_retryTimer == null && !_waitingForSignIn) unawaited(_pump());
  }

  static bool _needsWork(DraftAttachment attachment) =>
      attachment.status == AttachmentUploadStatus.pending ||
      attachment.status == AttachmentUploadStatus.uploading;

  Future<void> _pump() async {
    if (_running || _disposed) return;
    _running = true;
    try {
      while (!_disposed && _composer.phase == ComposerPhase.editing) {
        final next = _composer.draft?.attachments.where(_needsWork).firstOrNull;
        if (next == null) break;
        final outcome = await _step(next);
        if (outcome == _Outcome.progressed) {
          _failures = 0;
          _problem = null;
          continue;
        }
        if (outcome == _Outcome.waitForSignIn) {
          _waitingForSignIn = true;
          _onUnauthenticated();
        } else {
          _scheduleRetry();
        }
        break;
      }
    } finally {
      _running = false;
      _setActivity(null, null);
    }
  }

  void _scheduleRetry() {
    final factor = pow(2, min(_failures, 10)).toInt();
    final delay = retryBase * factor;
    _failures++;
    _retryTimer?.cancel();
    _retryTimer = Timer(delay > retryMax ? retryMax : delay, () {
      _retryTimer = null;
      unawaited(_pump());
    });
  }

  Future<_Outcome> _step(DraftAttachment attachment) {
    final path = attachment.compressedPath;
    if (path == null ||
        attachment.contentType == null ||
        attachment.byteSize == null) {
      return _compress(attachment);
    }
    final reservationId = attachment.reservationId;
    if (attachment.status == AttachmentUploadStatus.pending ||
        reservationId == null) {
      return _reserve(attachment);
    }
    final ticket = _tickets[reservationId];
    return ticket == null
        ? _check(attachment, resumed: true)
        : _upload(attachment, ticket);
  }

  Future<_Outcome> _compress(DraftAttachment attachment) async {
    _setActivity(attachment, UploadActivity.compressing);
    final result = await _compressor.compress(
      attachment,
      ownerId: _composer.userId,
    );
    switch (result) {
      case CompressionRejected(:final violation):
        return _drop(attachment, violation.message);
      case CompressionFailed():
        return _drop(attachment, "That file couldn't be read. Choose another.");
      case CompressionSucceeded(:final media):
        final others = _composer.draft?.attachments
            .where((other) => other != attachment)
            .map((other) => other.byteSize)
            .nonNulls;
        final violation = checkAttachmentLimits(
          mediaType: attachment.mediaType,
          byteSize: media.byteSize,
          otherBytes: others ?? const [],
          videoDuration: media.videoDuration,
        );
        if (violation != null) {
          await _compressor.discard(media.path);
          return _drop(attachment, violation.message);
        }
        final stored = _composer.replaceAttachment(
          attachment,
          DraftAttachment(
            localPath: attachment.localPath,
            mediaType: attachment.mediaType,
            compressedPath: media.path,
            contentType: media.contentType,
            byteSize: media.byteSize,
          ),
        );
        // Removed while compressing: nothing refers to the copy.
        if (!stored) await _compressor.discard(media.path);
        return _Outcome.progressed;
    }
  }

  Future<_Outcome> _reserve(DraftAttachment attachment) async {
    _setActivity(attachment, UploadActivity.uploading);
    final result = await _client.reserve(
      contentType: attachment.contentType!,
      byteSize: attachment.byteSize!,
    );
    switch (result) {
      case ApiSuccess(value: final ticket):
        _tickets[ticket.reservationId] = ticket;
        _composer.replaceAttachment(
          attachment,
          attachment.copyWith(
            reservationId: () => ticket.reservationId,
            status: AttachmentUploadStatus.uploading,
            failureReason: () => null,
          ),
        );
        return _Outcome.progressed;
      case ApiError(failure: RateLimited()):
        return _pause('Too many uploads are waiting. Trying again shortly.');
      case ApiError(failure: InvalidRequest()):
        return _drop(
          attachment,
          "That file can't be uploaded. Choose another.",
        );
      case ApiError(:final failure):
        return _pauseFor(failure);
    }
  }

  Future<_Outcome> _upload(
    DraftAttachment attachment,
    MediaUploadTicket ticket,
  ) async {
    _setActivity(attachment, UploadActivity.uploading);
    final path = attachment.compressedPath!;
    final result = await _client.upload(ticket, path);
    switch (result) {
      case ApiSuccess():
        _expiries.remove(path);
        return _check(attachment, resumed: false);
      case ApiError(failure: Expired()):
        _tickets.remove(ticket.reservationId);
        final expiries = (_expiries[path] ?? 0) + 1;
        _expiries[path] = expiries;
        if (expiries >= 3) {
          _expiries.remove(path);
          _reserveAgain(attachment);
          return _pause(
            "Uploads aren't working right now. Trying again later.",
          );
        }
        _reserveAgain(attachment);
        return _Outcome.progressed;
      case ApiError(failure: InvalidRequest()):
        // The compressed copy is missing or changed: make a new one.
        _tickets.remove(ticket.reservationId);
        _composer.replaceAttachment(attachment, attachment.restarted());
        return _Outcome.progressed;
      case ApiError(:final failure):
        return _pauseFor(failure);
    }
  }

  Future<_Outcome> _check(
    DraftAttachment attachment, {
    required bool resumed,
  }) async {
    _setActivity(attachment, UploadActivity.checking);
    final reservationId = attachment.reservationId!;
    final result = await _client.complete(reservationId);
    switch (result) {
      case ApiSuccess(value: MediaCheck(status: MediaCheckStatus.validated)):
        _tickets.remove(reservationId);
        _composer.replaceAttachment(
          attachment,
          attachment.copyWith(
            status: AttachmentUploadStatus.validated,
            failureReason: () => null,
          ),
        );
        return _Outcome.progressed;
      case ApiSuccess(
        value: MediaCheck(
          status: MediaCheckStatus.failed,
          :final failureReason,
        ),
      ):
        _tickets.remove(reservationId);
        _composer.replaceAttachment(
          attachment,
          attachment.copyWith(
            status: AttachmentUploadStatus.failed,
            failureReason: () => failureReason ?? 'rejected',
          ),
        );
        return _Outcome.progressed;
      case ApiSuccess(value: MediaCheck(status: MediaCheckStatus.pending)):
        // After a restart the upload may never have been sent, and its URL
        // is gone. Reserve again; the old reservation simply expires.
        if (resumed) {
          _reserveAgain(attachment);
          return _Outcome.progressed;
        }
        return _pause('Checking your upload. Trying again shortly.');
      case ApiError(failure: Expired() || NotFound()):
        _tickets.remove(reservationId);
        _reserveAgain(attachment);
        return _Outcome.progressed;
      case ApiError(:final failure):
        return _pauseFor(failure);
    }
  }

  /// Keeps the compressed copy but forgets the reservation.
  void _reserveAgain(DraftAttachment attachment) {
    _composer.replaceAttachment(
      attachment,
      DraftAttachment(
        localPath: attachment.localPath,
        mediaType: attachment.mediaType,
        compressedPath: attachment.compressedPath,
        contentType: attachment.contentType,
        byteSize: attachment.byteSize,
      ),
    );
  }

  _Outcome _drop(DraftAttachment attachment, String notice) {
    _composer.removeAttachment(attachment);
    _notice = notice;
    _notify();
    return _Outcome.progressed;
  }

  _Outcome _pauseFor(ApiFailure failure) => switch (failure) {
    Unauthenticated() => _pause(
      'Sign in again to finish uploading.',
      outcome: _Outcome.waitForSignIn,
    ),
    NetworkUnavailable() => _pause(
      "You're offline. Uploads will continue when you're connected.",
    ),
    _ => _pause("Uploads aren't available right now. Trying again shortly."),
  };

  _Outcome _pause(String problem, {_Outcome outcome = _Outcome.retryLater}) {
    _problem = problem;
    _notify();
    return outcome;
  }

  void _setActivity(DraftAttachment? attachment, UploadActivity? activity) {
    if (_active == attachment && _activity == activity) return;
    _active = attachment;
    _activity = activity;
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _retryTimer?.cancel();
    _composer.removeListener(_onDraftChanged);
    super.dispose();
  }
}

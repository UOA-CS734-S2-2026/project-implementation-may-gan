import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

import '../drafts/daily_post_draft.dart';
import 'composer_controller.dart';
import 'voice_recorder.dart';

enum RecordingPhase {
  idle,

  /// Asking for the microphone and opening it. Nothing is recorded yet.
  starting,
  recording,

  /// Recording has stopped and the file is being checked.
  saving,
}

/// Records one voice memo for the composer.
///
/// It only ever records because the author tapped record: never on opening the
/// composer, on returning to the app, or while the app is in the background.
/// Microphone access is asked for at that first tap, after a short
/// explanation, and a refusal changes nothing else about the composer.
class VoiceMemoRecorderController extends ChangeNotifier {
  VoiceMemoRecorderController({
    required this.ownerId,
    required this._recorder,
    required this._permission,
    required this._files,
    required this.onRecorded,
    DateTime Function()? clock,
    this.limit = DailyPostLimits.voiceMemoRecordingMax,
    this.minimum = const Duration(seconds: 1),
    this.tick = const Duration(milliseconds: 100),
  }) : _clock = clock ?? DateTime.now;

  /// How many bars the saved loudness picture has.
  static const waveformBuckets = 48;

  /// How many of the latest levels [levels] keeps for the live meter.
  static const liveLevels = 36;

  final String ownerId;
  final VoiceRecorder _recorder;
  final MicrophonePermission _permission;
  final VoiceMemoFiles _files;
  final DateTime Function() _clock;

  /// Where the recorder stops on its own, a little under the API's limit.
  final Duration limit;

  /// Shorter takes are discarded, so a stray tap doesn't make a memo.
  final Duration minimum;
  final Duration tick;

  /// Called with the finished memo, ready to reserve and upload.
  final void Function(DraftAttachment memo) onRecorded;

  RecordingPhase _phase = RecordingPhase.idle;
  Duration _elapsed = Duration.zero;
  final _recent = <double>[];
  final _samples = <double>[];
  String? _notice;
  String? _info;
  bool _settingsCanFix = false;
  DateTime? _startedAt;
  Timer? _ticker;
  StreamSubscription<double>? _levelSubscription;
  String? _path;
  bool _disposed = false;

  RecordingPhase get phase => _phase;
  bool get isRecording => _phase == RecordingPhase.recording;
  bool get isBusy => _phase != RecordingPhase.idle;

  /// How long the current take has run.
  Duration get elapsed => _elapsed;

  /// The latest input levels, oldest first, for the live meter.
  List<double> get levels => List.unmodifiable(_recent);

  /// Why nothing was recorded: a refusal, or a failure.
  String? get notice => _notice;

  /// Something to tell the author that isn't a problem, such as having reached
  /// the limit.
  String? get info => _info;

  /// True when only the system Settings can turn the microphone on.
  bool get settingsCanFix => _settingsCanFix;

  /// Taps record. [explain] shows the short reason for needing the microphone
  /// and returns true to go on. It is only called when the system is about to
  /// ask, so an author who already allowed it isn't asked twice.
  Future<void> start({required Future<bool> Function() explain}) async {
    if (isBusy || _disposed) return;
    _phase = RecordingPhase.starting;
    _notice = null;
    _info = null;
    _settingsCanFix = false;
    notifyListeners();

    if (!await _hasMicrophone(explain)) return _failedToStart();

    final String path;
    try {
      path = await _files.newPath(ownerId);
      await _recorder.start(path);
    } catch (_) {
      _notice = "Couldn't start recording. Try again.";
      return _failedToStart();
    }
    if (_disposed) {
      await _recorder.cancel();
      return;
    }

    _path = path;
    _samples.clear();
    _recent.clear();
    _elapsed = Duration.zero;
    _startedAt = _clock();
    _levelSubscription = _recorder.levels.listen(_onLevel);
    _ticker = Timer.periodic(tick, (_) => _onTick());
    _phase = RecordingPhase.recording;
    notifyListeners();
  }

  /// True once the microphone may be used, asking if that hasn't been settled.
  Future<bool> _hasMicrophone(Future<bool> Function() explain) async {
    var status = await _permission.status();
    if (status.isGranted) return true;
    if (status.isRestricted) {
      _notice =
          'The microphone is restricted on this device. You can still post '
          'without a voice memo.';
      return false;
    }
    if (!status.isPermanentlyDenied) {
      if (!await explain()) return false;
      status = await _permission.request();
      if (status.isGranted) return true;
    }
    if (status.isPermanentlyDenied) {
      _notice =
          'Microphone access is off for Dayli. Turn it on in Settings to '
          'record a voice memo.';
      _settingsCanFix = true;
    } else {
      _notice =
          'Microphone access was declined. You can still post without a '
          'voice memo.';
    }
    return false;
  }

  void _failedToStart() {
    _phase = RecordingPhase.idle;
    if (!_disposed) notifyListeners();
  }

  void _onLevel(double level) {
    if (!isRecording) return;
    _samples.add(level);
    _recent.add(level);
    if (_recent.length > liveLevels) _recent.removeAt(0);
  }

  void _onTick() {
    final startedAt = _startedAt;
    if (!isRecording || startedAt == null) return;
    _elapsed = _clock().difference(startedAt);
    if (_elapsed >= limit) {
      unawaited(stop(reachedLimit: true));
      return;
    }
    notifyListeners();
  }

  /// Stops and keeps the take, unless it was too short.
  Future<void> stop({bool reachedLimit = false}) async {
    if (!isRecording) return;
    final startedAt = _startedAt!;
    _phase = RecordingPhase.saving;
    _stopTimers();
    _elapsed = _clock().difference(startedAt);
    notifyListeners();

    String? written;
    try {
      written = await _recorder.stop();
    } catch (_) {
      written = null;
    }
    final planned = _path;
    _path = null;
    final path = written;
    if (path == null) {
      // The recorder says it wrote nothing; clear away any partial file.
      if (planned != null) await _files.delete(planned);
      return _finish(notice: "Couldn't save the recording. Try again.");
    }

    final tooShort = _elapsed < minimum;
    final size = tooShort ? 0 : await _files.length(path).catchError((_) => 0);
    final peaks = _peaks();
    final violation = tooShort
        ? null
        : checkAttachmentLimits(
            mediaType: DraftAttachment.voiceMemoMediaType,
            byteSize: size,
            videoDuration: _elapsed,
          );
    if (tooShort || violation != null || _disposed) {
      await _files.delete(path);
      return _finish(
        notice: tooShort
            ? 'That was too short. Tap record and say a little more.'
            : violation?.message,
      );
    }

    final memo = DraftAttachment(
      localPath: path,
      mediaType: DraftAttachment.voiceMemoMediaType,
      // Already the upload format, so there is nothing to compress.
      compressedPath: path,
      contentType: 'audio/mp4',
      byteSize: size,
      durationMs: _elapsed.inMilliseconds,
      waveform: peaks,
    );
    onRecorded(memo);
    _finish(
      info: reachedLimit
          ? 'That is the one minute limit, so your voice memo stopped there.'
          : null,
    );
  }

  /// Stops recording because the app is no longer in front. The take so far is
  /// kept: leaving never starts a recording, but it shouldn't throw one away.
  Future<void> stopForBackground() async {
    if (!isRecording) return;
    await stop();
    if (_notice == null && _info == null) {
      _info = 'Recording stopped when you left Dayli.';
      if (!_disposed) notifyListeners();
    }
  }

  /// Stops and throws the take away.
  Future<void> cancel() async {
    if (!isRecording) return;
    _phase = RecordingPhase.saving;
    _stopTimers();
    notifyListeners();
    try {
      await _recorder.cancel();
    } catch (_) {}
    _path = null;
    _finish();
  }

  void _finish({String? notice, String? info}) {
    _notice = notice;
    _info = info;
    _phase = RecordingPhase.idle;
    _elapsed = Duration.zero;
    _recent.clear();
    _samples.clear();
    if (!_disposed) notifyListeners();
  }

  void _stopTimers() {
    _ticker?.cancel();
    _ticker = null;
    unawaited(_levelSubscription?.cancel());
    _levelSubscription = null;
  }

  void clearMessages() {
    if (_notice == null && _info == null) return;
    _notice = null;
    _info = null;
    _settingsCanFix = false;
    notifyListeners();
  }

  Future<void> openSettings() => _permission.openSettings();

  /// The recording's loudness as [waveformBuckets] values from 0 to 255, the
  /// loudest moment in each slice of the take. Null when no levels arrived.
  List<int>? _peaks() {
    final count = _samples.length;
    if (count == 0) return null;
    return List<int>.unmodifiable([
      for (var bucket = 0; bucket < waveformBuckets; bucket++)
        () {
          final from = bucket * count ~/ waveformBuckets;
          final to = ((bucket + 1) * count ~/ waveformBuckets).clamp(
            from + 1,
            count,
          );
          var loudest = 0.0;
          for (var index = from; index < to; index++) {
            if (_samples[index] > loudest) loudest = _samples[index];
          }
          return (loudest.clamp(0.0, 1.0) * 255).round();
        }(),
    ]);
  }

  @override
  void dispose() {
    _disposed = true;
    final wasRecording = isRecording;
    _stopTimers();
    // Closing the composer mid-take throws the take away.
    if (wasRecording) unawaited(_recorder.cancel().catchError((_) {}));
    unawaited(_recorder.dispose().catchError((_) {}));
    super.dispose();
  }
}

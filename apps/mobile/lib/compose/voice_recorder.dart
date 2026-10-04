import 'dart:async';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';

import 'composer_controller.dart';
import 'media_compressor.dart';

/// Records a voice memo to a file. Everything the app knows about the
/// microphone goes through this, so tests and the composer never touch
/// hardware.
abstract interface class VoiceRecorder {
  /// Starts writing AAC audio (an `.m4a` file) to [path]. Throws when the
  /// microphone can't be opened.
  Future<void> start(String path);

  /// How loud the input is, from 0 (silence) to 1, about ten times a second
  /// while recording.
  Stream<double> get levels;

  /// Stops and returns the finished file's path, or null when nothing was
  /// written.
  Future<String?> stop();

  /// Stops and deletes what was written.
  Future<void> cancel();

  Future<void> dispose();
}

class DeviceVoiceRecorder implements VoiceRecorder {
  DeviceVoiceRecorder() : _recorder = AudioRecorder();

  final AudioRecorder _recorder;
  final _levels = StreamController<double>.broadcast();
  StreamSubscription<Amplitude>? _amplitudes;

  /// Quiet speech sits around -40 dB and shouting near -5, so anything below
  /// this floor is drawn as silence.
  static const _floorDecibels = -50.0;

  /// Mono AAC at 64 kbps: clear for speech, and about 0.5 MB for the longest
  /// memo, far under the 2 MB limit.
  static const _config = RecordConfig(
    encoder: AudioEncoder.aacLc,
    bitRate: 64000,
    sampleRate: 44100,
    numChannels: 1,
  );

  @override
  Stream<double> get levels => _levels.stream;

  @override
  Future<void> start(String path) async {
    await _recorder.start(_config, path: path);
    _amplitudes = _recorder
        .onAmplitudeChanged(const Duration(milliseconds: 100))
        .listen((amplitude) {
          final level = (amplitude.current - _floorDecibels) / -_floorDecibels;
          if (!_levels.isClosed) _levels.add(level.clamp(0.0, 1.0));
        });
  }

  @override
  Future<String?> stop() async {
    await _amplitudes?.cancel();
    _amplitudes = null;
    return _recorder.stop();
  }

  @override
  Future<void> cancel() async {
    await _amplitudes?.cancel();
    _amplitudes = null;
    await _recorder.cancel();
  }

  @override
  Future<void> dispose() async {
    await _amplitudes?.cancel();
    await _levels.close();
    await _recorder.dispose();
  }
}

/// Microphone access, apart from the microphone itself so tests can script it.
abstract interface class MicrophonePermission {
  Future<PermissionStatus> status();
  Future<PermissionStatus> request();
  Future<bool> openSettings();
}

class DeviceMicrophonePermission implements MicrophonePermission {
  const DeviceMicrophonePermission();

  @override
  Future<PermissionStatus> status() => Permission.microphone.status;

  @override
  Future<PermissionStatus> request() => Permission.microphone.request();

  @override
  Future<bool> openSettings() => openAppSettings();
}

/// Where a recording is written. Always inside the signed-in user's own media
/// folder, so it is deleted with their other copies at sign-out and survives
/// the app being closed before the memo is posted.
abstract interface class VoiceMemoFiles {
  Future<String> newPath(String ownerId);

  /// The size of [path] in bytes.
  Future<int> length(String path);

  /// Deletes [path], if it is still there.
  Future<void> delete(String path);
}

class DeviceVoiceMemoFiles implements VoiceMemoFiles {
  const DeviceVoiceMemoFiles();

  @override
  Future<String> newPath(String ownerId) async {
    final support = await getApplicationSupportDirectory();
    final folder = Directory(
      '${support.path}/$mediaFolderName/${userMediaFolder(ownerId)}',
    );
    await folder.create(recursive: true);
    return '${folder.path}/${generateIdempotencyKey()}.m4a';
  }

  @override
  Future<int> length(String path) => File(path).length();

  @override
  Future<void> delete(String path) async {
    try {
      await File(path).delete();
    } on FileSystemException {
      // Already gone.
    }
  }
}

/// What the composer needs to record a voice memo. Tests replace it.
class VoiceMemoServices {
  const VoiceMemoServices({
    this.createRecorder = DeviceVoiceRecorder.new,
    this.permission = const DeviceMicrophonePermission(),
    this.files = const DeviceVoiceMemoFiles(),
    this.clock = DateTime.now,
  });

  /// A new recorder for each composer, disposed with it.
  final VoiceRecorder Function() createRecorder;
  final MicrophonePermission permission;
  final VoiceMemoFiles files;

  /// What time it is, which a recording's length is measured against.
  final DateTime Function() clock;
}

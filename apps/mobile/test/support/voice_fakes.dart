import 'dart:async';

import 'package:dayli_mobile/compose/voice_recorder.dart';
import 'package:permission_handler/permission_handler.dart';

/// A recorder that writes nothing: tests push levels and read what it was
/// asked to do.
class FakeVoiceRecorder implements VoiceRecorder {
  final started = <String>[];
  var stops = 0;
  var cancels = 0;
  var disposed = false;

  /// Make [start] fail, as when the microphone is in use.
  bool failToStart = false;

  /// What [stop] returns; null means nothing was written.
  bool writesFile = true;

  final _levels = StreamController<double>.broadcast();

  @override
  Stream<double> get levels => _levels.stream;

  void emit(double level) => _levels.add(level);

  @override
  Future<void> start(String path) async {
    if (failToStart) throw StateError('microphone in use');
    started.add(path);
  }

  @override
  Future<String?> stop() async {
    stops++;
    return writesFile && started.isNotEmpty ? started.last : null;
  }

  @override
  Future<void> cancel() async => cancels++;

  @override
  Future<void> dispose() async => disposed = true;
}

class FakeMicrophonePermission implements MicrophonePermission {
  FakeMicrophonePermission({
    this.current = PermissionStatus.denied,
    this.afterRequest = PermissionStatus.granted,
  });

  PermissionStatus current;
  PermissionStatus afterRequest;
  var requests = 0;
  var settingsOpened = 0;

  @override
  Future<PermissionStatus> status() async => current;

  @override
  Future<PermissionStatus> request() async {
    requests++;
    return current = afterRequest;
  }

  @override
  Future<bool> openSettings() async {
    settingsOpened++;
    return true;
  }
}

class FakeVoiceMemoFiles implements VoiceMemoFiles {
  /// The size every recording reports, unless [sizes] names it.
  int defaultSize = 400 * 1024;
  final sizes = <String, int>{};
  final deleted = <String>[];
  final owners = <String>[];
  var _next = 0;

  @override
  Future<String> newPath(String ownerId) async {
    owners.add(ownerId);
    return '/memos/${_next++}.m4a';
  }

  @override
  Future<int> length(String path) async => sizes[path] ?? defaultSize;

  @override
  Future<void> delete(String path) async => deleted.add(path);
}

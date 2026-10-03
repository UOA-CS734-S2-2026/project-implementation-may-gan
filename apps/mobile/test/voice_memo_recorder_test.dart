import 'dart:async';

import 'package:dayli_mobile/compose/voice_memo_recorder.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:permission_handler/permission_handler.dart';

import 'support/voice_fakes.dart';

void main() {
  late FakeVoiceRecorder recorder;
  late FakeMicrophonePermission permission;
  late FakeVoiceMemoFiles files;
  late List<DraftAttachment> recorded;
  var explained = 0;
  var agree = true;

  Future<bool> explain() async {
    explained++;
    return agree;
  }

  setUp(() {
    recorder = FakeVoiceRecorder();
    permission = FakeMicrophonePermission(current: PermissionStatus.granted);
    files = FakeVoiceMemoFiles();
    recorded = [];
    explained = 0;
    agree = true;
  });

  /// Runs [body] with a controller whose clock is the fake one, so seconds of
  /// recording take no real time.
  void withController(
    void Function(FakeAsync async, VoiceMemoRecorderController controller) body,
  ) {
    fakeAsync((async) {
      final origin = DateTime.utc(2026, 9, 25, 3);
      final controller = VoiceMemoRecorderController(
        ownerId: 'user-1',
        recorder: recorder,
        permission: permission,
        files: files,
        onRecorded: recorded.add,
        clock: () => origin.add(async.elapsed),
      );
      body(async, controller);
      controller.dispose();
      async.flushMicrotasks();
    });
  }

  void tapRecord(FakeAsync async, VoiceMemoRecorderController controller) {
    unawaited(controller.start(explain: explain));
    async.flushMicrotasks();
  }

  void tapStop(FakeAsync async, VoiceMemoRecorderController controller) {
    unawaited(controller.stop());
    async.flushMicrotasks();
  }

  group('never records on its own', () {
    test('doing nothing records nothing', () {
      withController((async, controller) {
        async.elapse(const Duration(minutes: 5));

        expect(controller.phase, RecordingPhase.idle);
        expect(recorder.started, isEmpty);
        expect(permission.requests, 0);
      });
    });

    test('a second tap while one is starting is ignored', () {
      withController((async, controller) {
        unawaited(controller.start(explain: explain));
        unawaited(controller.start(explain: explain));
        async.flushMicrotasks();

        expect(recorder.started, hasLength(1));
      });
    });
  });

  group('microphone access', () {
    test('already allowed: starts without explaining or asking', () {
      withController((async, controller) {
        tapRecord(async, controller);

        expect(controller.isRecording, isTrue);
        expect(explained, 0);
        expect(permission.requests, 0);
        expect(files.owners, ['user-1']);
      });
    });

    test('first time: explains, then the system asks, then records', () {
      permission.current = PermissionStatus.denied;
      withController((async, controller) {
        tapRecord(async, controller);

        expect(explained, 1);
        expect(permission.requests, 1);
        expect(controller.isRecording, isTrue);
      });
    });

    test('declining the explanation changes nothing and asks nothing', () {
      permission.current = PermissionStatus.denied;
      agree = false;
      withController((async, controller) {
        tapRecord(async, controller);

        expect(controller.phase, RecordingPhase.idle);
        expect(permission.requests, 0);
        expect(controller.notice, isNull);
        expect(recorder.started, isEmpty);
      });
    });

    test('a refused prompt says so, with no Settings action', () {
      permission.current = PermissionStatus.denied;
      permission.afterRequest = PermissionStatus.denied;
      withController((async, controller) {
        tapRecord(async, controller);

        expect(controller.phase, RecordingPhase.idle);
        expect(controller.notice, contains('declined'));
        expect(controller.settingsCanFix, isFalse);
        expect(recorder.started, isEmpty);
      });
    });

    test('a prompt refused for good offers Settings', () {
      permission.current = PermissionStatus.denied;
      permission.afterRequest = PermissionStatus.permanentlyDenied;
      withController((async, controller) {
        tapRecord(async, controller);

        expect(controller.notice, contains('Settings'));
        expect(controller.settingsCanFix, isTrue);
        unawaited(controller.openSettings());
        async.flushMicrotasks();
        expect(permission.settingsOpened, 1);
      });
    });

    test('already refused for good: no explanation and no second prompt', () {
      permission.current = PermissionStatus.permanentlyDenied;
      withController((async, controller) {
        tapRecord(async, controller);

        expect(explained, 0);
        expect(permission.requests, 0);
        expect(controller.settingsCanFix, isTrue);
      });
    });

    test('restricted by the device: says so and offers no Settings', () {
      permission.current = PermissionStatus.restricted;
      withController((async, controller) {
        tapRecord(async, controller);

        expect(explained, 0);
        expect(permission.requests, 0);
        expect(controller.notice, contains('restricted'));
        expect(controller.settingsCanFix, isFalse);
      });
    });

    test('a microphone that will not open reports it and stays usable', () {
      recorder.failToStart = true;
      withController((async, controller) {
        tapRecord(async, controller);

        expect(controller.phase, RecordingPhase.idle);
        expect(controller.notice, contains("Couldn't start"));
      });
    });
  });

  group('recording and keeping a take', () {
    test('keeps the elapsed time moving and saves a ready memo', () {
      withController((async, controller) {
        tapRecord(async, controller);
        async.elapse(const Duration(seconds: 12));
        expect(controller.elapsed, const Duration(seconds: 12));

        tapStop(async, controller);

        final memo = recorded.single;
        expect(memo.mediaType, 'audio');
        expect(memo.isVoiceMemo, isTrue);
        expect(memo.localPath, '/memos/0.m4a');
        // Already the upload format: nothing left to compress.
        expect(memo.compressedPath, memo.localPath);
        expect(memo.contentType, 'audio/mp4');
        expect(memo.byteSize, 400 * 1024);
        expect(memo.durationMs, 12000);
        expect(memo.status, AttachmentUploadStatus.pending);
        expect(controller.phase, RecordingPhase.idle);
      });
    });

    test('draws the loudest moment of each slice as the waveform', () {
      withController((async, controller) {
        tapRecord(async, controller);
        // 96 levels: a quiet half and a loud half, with one spike.
        for (var i = 0; i < 96; i++) {
          recorder.emit(i < 48 ? 0.1 : 0.5);
        }
        recorder.emit(1.0);
        async.elapse(const Duration(seconds: 5));
        tapStop(async, controller);

        final peaks = recorded.single.waveform!;
        expect(peaks, hasLength(VoiceMemoRecorderController.waveformBuckets));
        expect(peaks.first, closeTo(0.1 * 255, 1));
        expect(peaks[30], closeTo(0.5 * 255, 1));
        expect(peaks.last, 255);
        expect(peaks.every((p) => p >= 0 && p <= 255), isTrue);
      });
    });

    test('keeps only the latest levels for the live meter', () {
      withController((async, controller) {
        tapRecord(async, controller);
        for (var i = 0; i < 100; i++) {
          recorder.emit(i / 100);
        }
        async.flushMicrotasks();

        expect(
          controller.levels,
          hasLength(VoiceMemoRecorderController.liveLevels),
        );
        expect(controller.levels.last, closeTo(0.99, 1e-9));
      });
    });

    test('a take with no levels is still kept, just without a picture', () {
      withController((async, controller) {
        tapRecord(async, controller);
        async.elapse(const Duration(seconds: 3));
        tapStop(async, controller);

        expect(recorded.single.waveform, isNull);
      });
    });
  });

  group('the one minute limit', () {
    test('stops by itself a second under it and says so', () {
      withController((async, controller) {
        tapRecord(async, controller);
        async.elapse(const Duration(seconds: 70));
        async.flushMicrotasks();

        expect(controller.isRecording, isFalse);
        expect(recorder.stops, 1);
        final memo = recorded.single;
        expect(memo.durationMs, lessThan(60000));
        expect(memo.durationMs, greaterThanOrEqualTo(59000));
        expect(controller.info, contains('one minute limit'));
      });
    });

    test('stays under what the API accepts with the file running long', () {
      withController((async, controller) {
        tapRecord(async, controller);
        async.elapse(const Duration(seconds: 70));
        async.flushMicrotasks();

        // A file runs about 0.2 s longer than the time the recorder was asked
        // for, and the API rejects anything over 60 s.
        final withOverrun = recorded.single.durationMs! + 400;
        expect(withOverrun, lessThan(60000));
      });
    });
  });

  group('takes that are not kept', () {
    test('a stray tap shorter than a second is thrown away', () {
      withController((async, controller) {
        tapRecord(async, controller);
        async.elapse(const Duration(milliseconds: 400));
        tapStop(async, controller);

        expect(recorded, isEmpty);
        expect(files.deleted, ['/memos/0.m4a']);
        expect(controller.notice, contains('too short'));
      });
    });

    test('a file over the size limit is thrown away', () {
      files.defaultSize = 3 * 1024 * 1024;
      withController((async, controller) {
        tapRecord(async, controller);
        async.elapse(const Duration(seconds: 20));
        tapStop(async, controller);

        expect(recorded, isEmpty);
        expect(files.deleted, ['/memos/0.m4a']);
        expect(controller.notice, isNotNull);
      });
    });

    test('a recorder that wrote nothing reports it', () {
      recorder.writesFile = false;
      withController((async, controller) {
        tapRecord(async, controller);
        async.elapse(const Duration(seconds: 5));
        tapStop(async, controller);

        expect(recorded, isEmpty);
        expect(controller.notice, contains("Couldn't save"));
      });
    });

    test('cancel discards the take without keeping or deleting by hand', () {
      withController((async, controller) {
        tapRecord(async, controller);
        async.elapse(const Duration(seconds: 8));
        unawaited(controller.cancel());
        async.flushMicrotasks();

        expect(recorded, isEmpty);
        expect(recorder.cancels, 1);
        expect(controller.phase, RecordingPhase.idle);
        expect(controller.elapsed, Duration.zero);
      });
    });

    test('closing the composer mid-take throws the take away', () {
      fakeAsync((async) {
        final controller = VoiceMemoRecorderController(
          ownerId: 'user-1',
          recorder: recorder,
          permission: permission,
          files: files,
          onRecorded: recorded.add,
        );
        unawaited(controller.start(explain: explain));
        async.flushMicrotasks();

        controller.dispose();
        async.flushMicrotasks();

        expect(recorder.cancels, 1);
        expect(recorder.disposed, isTrue);
        expect(recorded, isEmpty);
      });
    });
  });

  group('leaving the app', () {
    test('stops and keeps the take instead of recording in the background', () {
      withController((async, controller) {
        tapRecord(async, controller);
        async.elapse(const Duration(seconds: 15));
        unawaited(controller.stopForBackground());
        async.flushMicrotasks();

        expect(controller.isRecording, isFalse);
        expect(recorded.single.durationMs, 15000);
        expect(controller.info, contains('stopped'));
      });
    });

    test('does nothing when nothing is recording', () {
      withController((async, controller) {
        unawaited(controller.stopForBackground());
        async.flushMicrotasks();

        expect(recorder.stops, 0);
        expect(controller.info, isNull);
      });
    });
  });
}

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/media_upload_client.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/compose/composer_controller.dart';
import 'package:dayli_mobile/compose/composer_screen.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

import 'support/compose_actions.dart';
import 'support/fakes.dart';

const _record = Key('composer.voiceMemo.record');
const _stop = Key('composer.voiceMemo.stop');
const _cancel = Key('composer.voiceMemo.cancel');
const _remove = Key('composer.voiceMemo.remove');
const _rerecord = Key('composer.voiceMemo.rerecord');
const _settings = Key('composer.voiceMemo.settings');

late FakeVideoPlatform _videos;

Future<void> _openComposer(WidgetTester tester, TestHarness harness) async {
  await tester.pumpWidget(
    DayliApp(services: harness.services, useGoogleFonts: false),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('landing.sign-in')));
  await tester.pumpAndSettle();
  await tester.enterText(
    find.byKey(const Key('auth.email')),
    'jos@example.test',
  );
  await tester.enterText(
    find.byKey(const Key('auth.password')),
    'correct-password',
  );
  await tester.tap(find.byKey(const Key('auth.submit')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('shell.newDayli')));
  await tester.pumpAndSettle();
}

Finder _list() => find
    .descendant(
      of: find.byType(ComposerScreen),
      matching: find.byType(Scrollable),
    )
    .first;

Future<void> _scrollTo(WidgetTester tester, Key key) =>
    tester.scrollUntilVisible(find.byKey(key), 150, scrollable: _list());

/// Taps record and, if the explanation shows, continues.
Future<void> _tapRecord(WidgetTester tester) async {
  await _scrollTo(tester, _record);
  await tester.tap(find.byKey(_record));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  final next = find.byKey(const Key('composer.voiceMemo.explain.continue'));
  if (next.evaluate().isNotEmpty) {
    await tester.tap(next);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }
}

/// Lets a recording run for [seconds] of fake time.
Future<void> _record_(WidgetTester tester, int seconds) async {
  for (var i = 0; i < seconds * 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// Taps [key], scrolling to it first.
Future<void> _tapKey(WidgetTester tester, Key key) async {
  await tester.ensureVisible(find.byKey(key));
  await tester.pump();
  await tester.tap(find.byKey(key));
  await tester.pump();
}

/// Taps Stop, scrolling to it first, then lets the memo be saved to the draft.
Future<void> _tapStop(WidgetTester tester) async {
  await tester.ensureVisible(find.byKey(_stop));
  await tester.pump();
  await tester.tap(find.byKey(_stop));
  await tester.pump();
  await tester.pump(const Duration(seconds: 1));
}

/// The draft as saved, once the pending save has run.
Future<List<DraftAttachment>> _saved(
  WidgetTester tester,
  TestHarness harness,
) async {
  await tester.pump(const Duration(seconds: 1));
  return harness.drafts.drafts['user-1']!.attachments;
}

String _time(WidgetTester tester) => tester
    .widget<Text>(find.byKey(const Key('composer.voiceMemo.time')))
    .textSpan!
    .toPlainText();

String _status(WidgetTester tester) => tester
    .widget<Text>(find.byKey(const Key('composer.voiceMemo.status')))
    .data!;

void main() {
  setUp(() {
    _videos = FakeVideoPlatform()..mediaDuration = const Duration(seconds: 8);
    VideoPlayerPlatform.instance = _videos;
  });

  group('the idle section', () {
    testWidgets('offers an optional memo and never records by itself', (
      tester,
    ) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await tester.pumpAndSettle(const Duration(seconds: 2));
      await _scrollTo(tester, _record);

      expect(find.text('your voice'), findsOneWidget);
      expect(find.text('Record a voice memo'), findsOneWidget);
      expect(find.textContaining('Up to 1 minute'), findsOneWidget);
      expect(harness.voiceRecorder.started, isEmpty);
      expect(harness.microphone.requests, 0);
    });

    testWidgets('is left out of a build that does not upload media', (
      tester,
    ) async {
      final harness = TestHarness(uploadMedia: false);
      await _openComposer(tester, harness);

      expect(find.byKey(_record), findsNothing);
      expect(find.text('your voice'), findsNothing);
    });
  });

  group('microphone access', () {
    testWidgets('explains first, then the system asks, then it records', (
      tester,
    ) async {
      final harness = TestHarness();
      harness.microphone.current = PermissionStatus.denied;
      await _openComposer(tester, harness);
      await _scrollTo(tester, _record);
      await tester.tap(find.byKey(_record));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('Record a voice memo?'), findsOneWidget);
      expect(
        find.textContaining('only while you\'re recording'),
        findsOneWidget,
      );
      // Nothing has been asked of the system yet.
      expect(harness.microphone.requests, 0);

      await tester.tap(
        find.byKey(const Key('composer.voiceMemo.explain.continue')),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(harness.microphone.requests, 1);
      expect(
        find.byKey(const Key('composer.voiceMemo.recording')),
        findsOneWidget,
      );
      await tester.tap(find.byKey(_cancel));
      await tester.pump();
    });

    testWidgets('"Not now" on the explanation leaves everything as it was', (
      tester,
    ) async {
      final harness = TestHarness();
      harness.microphone.current = PermissionStatus.denied;
      await _openComposer(tester, harness);
      await _scrollTo(tester, _record);
      await tester.tap(find.byKey(_record));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.tap(
        find.byKey(const Key('composer.voiceMemo.explain.decline')),
      );
      await tester.pumpAndSettle();

      expect(harness.microphone.requests, 0);
      expect(harness.voiceRecorder.started, isEmpty);
      expect(find.byKey(const Key('composer.voiceMemo.message')), findsNothing);
      expect(find.byKey(_record), findsOneWidget);
    });

    testWidgets('is not explained again once it is allowed', (tester) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await _tapRecord(tester);

      expect(find.text('Record a voice memo?'), findsNothing);
      expect(harness.voiceRecorder.started, hasLength(1));
      await tester.tap(find.byKey(_cancel));
      await tester.pump();
    });

    testWidgets('a refusal for good offers Settings, which opens them', (
      tester,
    ) async {
      final harness = TestHarness();
      harness.microphone.current = PermissionStatus.permanentlyDenied;
      await _openComposer(tester, harness);
      await _tapRecord(tester);

      expect(
        find.textContaining('Microphone access is off for Dayli'),
        findsOneWidget,
      );
      await tester.tap(find.byKey(_settings));
      await tester.pump();
      expect(harness.microphone.settingsOpened, 1);
      expect(harness.voiceRecorder.started, isEmpty);
    });

    testWidgets('a plain refusal says so and offers no Settings', (
      tester,
    ) async {
      final harness = TestHarness();
      harness.microphone.current = PermissionStatus.denied;
      harness.microphone.afterRequest = PermissionStatus.denied;
      await _openComposer(tester, harness);
      await _tapRecord(tester);

      expect(find.textContaining('declined'), findsOneWidget);
      expect(find.byKey(_settings), findsNothing);
    });

    testWidgets('a refusal never blocks posting the words', (tester) async {
      final harness = TestHarness();
      harness.microphone.current = PermissionStatus.permanentlyDenied;
      await _openComposer(tester, harness);
      await _tapRecord(tester);
      await _post(tester);

      final sent = harness.submitter.submitted.single;
      expect(sent.reflectiveAnswer, 'Coffee by the harbour');
      expect(sent.attachments, isEmpty);
    });
  });

  group('recording', () {
    testWidgets('shows recording, the elapsed time and the limit', (
      tester,
    ) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await _tapRecord(tester);
      await _record_(tester, 3);

      expect(find.text('Recording'), findsOneWidget);
      expect(_time(tester), contains('0:03'));
      expect(_time(tester), contains('/ 1:00'));
      await tester.tap(find.byKey(_cancel));
      await tester.pump();
    });

    testWidgets('shows the live level while it records', (tester) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await _tapRecord(tester);
      for (var i = 0; i < 20; i++) {
        harness.voiceRecorder.emit(0.2 + i * 0.03);
      }
      await tester.pump(const Duration(milliseconds: 150));

      expect(find.byType(CustomPaint), findsWidgets);
      await tester.tap(find.byKey(_cancel));
      await tester.pump();
    });

    testWidgets('cancel keeps nothing', (tester) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await _tapRecord(tester);
      await _record_(tester, 2);
      await tester.tap(find.byKey(_cancel));
      await tester.pump();

      expect(harness.voiceRecorder.cancels, 1);
      expect(find.byKey(_record), findsOneWidget);
      expect(
        (harness.drafts.drafts['user-1']?.attachments ??
            const <DraftAttachment>[]),
        isEmpty,
      );
    });

    testWidgets('stops by itself at the limit and keeps the memo', (
      tester,
    ) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await _tapRecord(tester);
      await _record_(tester, 62);
      await tester.pump(const Duration(milliseconds: 200));

      expect(
        find.byKey(const Key('composer.voiceMemo.recording')),
        findsNothing,
      );
      expect(find.textContaining('one minute limit'), findsOneWidget);
      expect(find.byKey(_rerecord), findsOneWidget);
      final memo = voiceMemoOf(await _saved(tester, harness));
      expect(memo!.durationMs, lessThan(60000));
    });

    testWidgets('stops, and keeps what was said, when the app is left', (
      tester,
    ) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await _tapRecord(tester);
      await _record_(tester, 5);

      for (final state in [
        AppLifecycleState.inactive,
        AppLifecycleState.hidden,
        AppLifecycleState.paused,
      ]) {
        tester.binding.handleAppLifecycleStateChanged(state);
      }
      await tester.pump(const Duration(milliseconds: 200));
      // A paused app draws nothing, but the recorder has stopped.
      expect(harness.voiceRecorder.stops, 1);

      // Coming back shows what was kept, and never starts another take.
      for (final state in [
        AppLifecycleState.hidden,
        AppLifecycleState.inactive,
        AppLifecycleState.resumed,
      ]) {
        tester.binding.handleAppLifecycleStateChanged(state);
      }
      await tester.pump(const Duration(seconds: 2));
      expect(harness.voiceRecorder.started, hasLength(1));
      expect(
        find.byKey(const Key('composer.voiceMemo.recording')),
        findsNothing,
      );
      expect(voiceMemoOf(await _saved(tester, harness)), isNotNull);
      await _scrollTo(tester, _rerecord);
      expect(find.textContaining('stopped when you left'), findsOneWidget);
    });
  });

  group('the recorded memo', () {
    Future<TestHarness> recorded(WidgetTester tester) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await _tapRecord(tester);
      await _record_(tester, 8);
      await _tapStop(tester);
      return harness;
    }

    testWidgets('can be listened to before posting', (tester) async {
      await recorded(tester);

      expect(find.byKey(const Key('voicePlayer')), findsOneWidget);
      expect(find.byKey(const Key('voicePlayer.toggle')), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('voicePlayer.toggle')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('voicePlayer.toggle')));
      await tester.pump();
      expect(_videos.calls, contains('play'));
      expect(_videos.sources.single, 'file:///memos/0.m4a');
    });

    testWidgets('uploads like a photo and is ready to post', (tester) async {
      final harness = await recorded(tester);
      await tester.pumpAndSettle();

      expect(_status(tester), 'Ready to post');
      expect(harness.mediaUploads.completed, ['reservation-1']);
      // It was already in the upload format, so nothing was compressed.
      expect(harness.mediaCompressor.compressed, isEmpty);
    });

    testWidgets('posts with the photos, the memo last', (tester) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await addFromLibrary(tester, 0);
      await _tapRecord(tester);
      await _record_(tester, 6);
      await _tapStop(tester);
      await tester.pumpAndSettle();
      await _post(tester);

      final sent = harness.submitter.submitted.single;
      expect(sent.attachments, hasLength(2));
      expect(sent.attachments.first.mediaType, 'image');
      expect(sent.attachments.last.isVoiceMemo, isTrue);
      expect(sent.attachments.last.status, AttachmentUploadStatus.validated);
    });

    testWidgets('does not use a photo slot', (tester) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await addFromLibrary(tester, 0);
      await addFromLibrary(tester, 1);
      await addFromLibrary(tester, 2);
      await _tapRecord(tester);
      await _record_(tester, 4);
      await _tapStop(tester);
      await tester.pumpAndSettle();

      // Three photos and a memo.
      final attachments = await _saved(tester, harness);
      expect(visualAttachments(attachments), hasLength(3));
      expect(voiceMemoOf(attachments), isNotNull);
      await tester.scrollUntilVisible(
        find.byKey(const Key('composer.media.status')),
        -150,
        scrollable: _list(),
      );
      final status = tester.widget<Text>(
        find.byKey(const Key('composer.media.status')),
      );
      expect(status.data, contains('3/3'));
    });

    testWidgets('is blocked from posting until it is validated', (
      tester,
    ) async {
      final harness = TestHarness();
      harness.mediaUploads.completeResults.add(
        const ApiSuccess(
          MediaCheck(
            MediaCheckStatus.failed,
            failureReason: 'malformed_container',
          ),
        ),
      );
      await _openComposer(tester, harness);
      await _tapRecord(tester);
      await _record_(tester, 5);
      await _tapStop(tester);
      await tester.pumpAndSettle();

      expect(_status(tester), 'This recording looks damaged. Record it again.');
      await _post(tester);
      expect(harness.submitter.submitted, isEmpty);
      await tester.scrollUntilVisible(
        find.byKey(const Key('composer.voiceMemo.message')),
        -150,
        scrollable: _list(),
      );
      expect(
        find.text("Remove the voice memo that couldn't be uploaded."),
        findsOneWidget,
      );
    });

    testWidgets('re-recording replaces the memo', (tester) async {
      final harness = await recorded(tester);
      await tester.pumpAndSettle();
      final first = voiceMemoOf(await _saved(tester, harness))!;

      await _tapKey(tester, _rerecord);
      await tester.pump(const Duration(milliseconds: 50));
      await _record_(tester, 3);
      await _tapStop(tester);
      await tester.pumpAndSettle();

      final attachments = await _saved(tester, harness);
      expect(attachments.where((a) => a.isVoiceMemo), hasLength(1));
      expect(voiceMemoOf(attachments)!.localPath, isNot(first.localPath));
    });

    testWidgets('cancelling a re-record keeps the earlier memo', (
      tester,
    ) async {
      final harness = await recorded(tester);
      await tester.pumpAndSettle();
      final first = voiceMemoOf(await _saved(tester, harness))!;

      await _tapKey(tester, _rerecord);
      await tester.pump(const Duration(milliseconds: 50));
      await _tapKey(tester, _cancel);
      await tester.pumpAndSettle();

      expect(
        voiceMemoOf(await _saved(tester, harness))!.localPath,
        first.localPath,
      );
      expect(find.byKey(const Key('voicePlayer')), findsOneWidget);
    });

    testWidgets('removing it leaves a draft with no memo', (tester) async {
      final harness = await recorded(tester);
      await tester.pumpAndSettle();
      await _tapKey(tester, _remove);
      await tester.pumpAndSettle();

      expect(voiceMemoOf(await _saved(tester, harness)), isNull);
      expect(find.byKey(_record), findsOneWidget);
    });
  });

  group('across restarts', () {
    testWidgets(
      'a saved memo is back, and playable, when the composer reopens',
      (tester) async {
        final harness = TestHarness();
        harness.drafts.drafts['user-1'] = DailyPostDraft(
          userId: 'user-1',
          localDate: '2026-09-25',
          promptId: 'prompt-09-25',
          promptText: 'What made you smile today?',
          idempotencyKey: 'saved-key',
          updatedAt: DateTime.utc(2026, 9, 25),
          attachments: const [
            DraftAttachment(
              localPath: '/memos/saved.m4a',
              mediaType: 'audio',
              compressedPath: '/memos/saved.m4a',
              contentType: 'audio/mp4',
              byteSize: 400000,
              durationMs: 21000,
              waveform: [10, 90, 200, 40],
              reservationId: 'reservation-9',
              status: AttachmentUploadStatus.validated,
            ),
          ],
        );
        await _openComposer(tester, harness);
        await tester.pumpAndSettle();

        await _scrollTo(tester, const Key('voicePlayer'));
        expect(find.byKey(const Key('voicePlayer')), findsOneWidget);
        expect(_status(tester), 'Ready to post');
        expect(_videos.sources.single, 'file:///memos/saved.m4a');
      },
    );
  });
}

/// Rates, writes and posts, so what is under test is the media.
Future<void> _post(WidgetTester tester) async {
  final list = _list();
  await tester.scrollUntilVisible(
    find.byKey(const Key('composer.rating')),
    100,
    scrollable: list,
  );
  await tester.drag(
    find.byKey(const Key('composer.rating')),
    const Offset(370, 0),
  );
  await tester.pump();
  await tester.scrollUntilVisible(
    find.byKey(const Key('composer.reflectiveAnswer')),
    100,
    scrollable: list,
  );
  await tester.enterText(
    find.byKey(const Key('composer.reflectiveAnswer')),
    'Coffee by the harbour',
  );
  await tester.scrollUntilVisible(
    find.byKey(const Key('composer.audience.solo')),
    100,
    scrollable: list,
  );
  await tester.tap(find.byKey(const Key('composer.audience.solo')));
  await tester.pump(const Duration(milliseconds: 500));
  await tester.ensureVisible(find.byKey(const Key('composer.submit')));
  await tester.pump(const Duration(milliseconds: 300));
  await tester.tap(find.byKey(const Key('composer.submit')));
  await tester.pumpAndSettle();
}

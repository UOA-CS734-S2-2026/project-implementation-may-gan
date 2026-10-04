import 'package:dayli_mobile/app/theme.dart';
import 'package:dayli_mobile/ui/voice_player.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

import 'support/fakes.dart';

void main() {
  late FakeVideoPlatform videos;

  setUp(() {
    videos = FakeVideoPlatform()..mediaDuration = const Duration(seconds: 34);
    VideoPlayerPlatform.instance = videos;
  });

  Future<void> show(WidgetTester tester, Widget pill) => tester.pumpWidget(
    MaterialApp(
      theme: buildDayliTheme(useGoogleFonts: false),
      home: Scaffold(
        body: Center(child: SizedBox(width: 340, child: pill)),
      ),
    ),
  );

  String time(WidgetTester tester) =>
      tester.widget<Text>(find.byKey(const Key('voicePlayer.time'))).data!;

  test('formats a time as minutes and seconds', () {
    expect(formatClock(Duration.zero), '0:00');
    expect(formatClock(const Duration(seconds: 7)), '0:07');
    expect(formatClock(const Duration(seconds: 59, milliseconds: 900)), '0:59');
    expect(formatClock(const Duration(minutes: 1)), '1:00');
    expect(formatClock(const Duration(seconds: -3)), '0:00');
  });

  group('fitting the waveform to its space', () {
    test('keeps every bar when they fit', () {
      final levels = List.filled(20, 0.5);
      expect(fitLevels(levels, 200), levels);
    });

    test('cuts the bars down to what fits, never past the width', () {
      final levels = List.generate(48, (i) => i / 47);
      final fitted = fitLevels(levels, 130);

      // 2 px bars with 2.5 px gaps: (130 + 2.5) / 4.5 = 29 bars.
      expect(fitted, hasLength(29));
      expect(
        fitted.length * 2 + (fitted.length - 1) * 2.5,
        lessThanOrEqualTo(130),
      );
    });

    test('keeps the loudest moment of each slice', () {
      final levels = List.filled(48, 0.1)..[5] = 1.0;
      final fitted = fitLevels(levels, 100);

      expect(fitted.reduce((a, b) => a > b ? a : b), 1.0);
      expect(fitted.where((level) => level == 1.0), hasLength(1));
    });

    test('draws nothing without levels or width', () {
      expect(fitLevels(const [], 100), isEmpty);
      expect(fitLevels([0.5, 0.5], 0), isEmpty);
    });
  });

  group('a friend\'s voice memo (a private URL)', () {
    final url = Uri.parse('https://storage.example.test/memo?sig=1');

    testWidgets('shows how long it is, and does not start by itself', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await show(tester, VoicePlayerPill.network(url: url));
      await tester.pumpAndSettle();

      expect(time(tester), '0:00 / 0:34');
      expect(videos.calls, isNot(contains('play')));
      expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
      expect(find.bySemanticsLabel('Play Voice memo'), findsOneWidget);
      semantics.dispose();
    });

    testWidgets('plays and pauses from the button', (tester) async {
      await show(tester, VoicePlayerPill.network(url: url));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('voicePlayer.toggle')));
      await tester.pump();
      expect(videos.calls.where((c) => c == 'play'), hasLength(1));
      expect(find.byIcon(Icons.pause_rounded), findsOneWidget);

      await tester.tap(find.byKey(const Key('voicePlayer.toggle')));
      await tester.pump();
      expect(videos.calls.where((c) => c == 'pause'), isNotEmpty);
      expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
    });

    testWidgets('follows the playback position', (tester) async {
      await show(tester, VoicePlayerPill.network(url: url));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('voicePlayer.toggle')));
      await tester.pump();

      videos.position = const Duration(seconds: 12);
      await tester.pump(const Duration(seconds: 1));

      expect(time(tester), '0:12 / 0:34');
    });

    testWidgets('seeks when the track is tapped', (tester) async {
      await show(tester, VoicePlayerPill.network(url: url));
      await tester.pumpAndSettle();

      final track = find.byKey(const Key('voicePlayer.track'));
      final rect = tester.getRect(track);
      await tester.tapAt(Offset(rect.left + rect.width / 2, rect.center.dy));
      await tester.pump();

      expect(videos.seeks.last.inSeconds, inInclusiveRange(16, 18));
    });

    testWidgets('goes back to the start when it finishes', (tester) async {
      await show(tester, VoicePlayerPill.network(url: url));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('voicePlayer.toggle')));
      await tester.pump();

      videos.finish(0);
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();

      expect(videos.seeks.last, Duration.zero);
      expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
    });

    testWidgets('pauses when the app leaves the foreground', (tester) async {
      await show(tester, VoicePlayerPill.network(url: url));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('voicePlayer.toggle')));
      await tester.pump();
      videos.calls.clear();

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump();

      expect(videos.calls, contains('pause'));
    });

    testWidgets('asks once for a fresh URL after a failed load', (
      tester,
    ) async {
      videos.failures = 1;
      var asked = 0;
      final fresh = Uri.parse('https://storage.example.test/memo?sig=2');
      await show(
        tester,
        VoicePlayerPill.network(
          url: url,
          onRefreshUrl: () async {
            asked++;
            return fresh;
          },
        ),
      );
      await tester.pumpAndSettle();

      expect(asked, 1);
      expect(videos.sources, [url.toString(), fresh.toString()]);
      expect(time(tester), '0:00 / 0:34');
    });

    testWidgets('gives up after the fresh URL fails too', (tester) async {
      videos.failures = 2;
      var asked = 0;
      await show(
        tester,
        VoicePlayerPill.network(
          url: url,
          onRefreshUrl: () async {
            asked++;
            return Uri.parse('https://storage.example.test/memo?sig=2');
          },
        ),
      );
      await tester.pumpAndSettle();

      expect(asked, 1);
      expect(find.byKey(const Key('voicePlayer.unavailable')), findsOneWidget);
      expect(find.text('Voice memo unavailable'), findsOneWidget);
    });

    testWidgets('is unavailable when there is no fresh URL', (tester) async {
      videos.failures = 1;
      await show(
        tester,
        VoicePlayerPill.network(url: url, onRefreshUrl: () async => null),
      );
      await tester.pumpAndSettle();

      expect(find.text('Voice memo unavailable'), findsOneWidget);
    });
  });

  group('the author\'s own recording (a file)', () {
    testWidgets('draws its loudness and knows its length up front', (
      tester,
    ) async {
      await show(
        tester,
        VoicePlayerPill.file(
          path: '/memos/0.m4a',
          waveform: List.filled(48, 128),
          duration: const Duration(seconds: 34),
        ),
      );
      // Before it loads, the length is already known.
      expect(time(tester), '0:00 / 0:34');
      await tester.pumpAndSettle();

      expect(videos.sources.single, 'file:///memos/0.m4a');
      expect(find.byType(CustomPaint), findsWidgets);
    });

    testWidgets('does not start by itself', (tester) async {
      await show(tester, const VoicePlayerPill.file(path: '/memos/0.m4a'));
      await tester.pumpAndSettle();

      expect(videos.calls, isNot(contains('play')));
    });
  });
}

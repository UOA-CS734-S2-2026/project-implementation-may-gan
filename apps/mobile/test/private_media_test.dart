import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/post_media.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/app/theme.dart';
import 'package:dayli_mobile/posts/private_media.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

import 'support/fakes.dart';

PostMedia media(
  String id, {
  String contentType = 'image/jpeg',
  String? url = 'https://storage.example.test/old',
}) => PostMedia(
  id: id,
  contentType: contentType,
  order: 0,
  url: url == null ? null : Uri.parse(url),
  expiresAt: null,
);

void main() {
  late TestHarness harness;
  late FakeVideoPlatform videos;

  setUp(() {
    harness = TestHarness();
    videos = FakeVideoPlatform();
    VideoPlayerPlatform.instance = videos;
  });

  Future<void> show(WidgetTester tester, Widget child) => tester.pumpWidget(
    AppScope(
      services: harness.services,
      child: MaterialApp(
        theme: buildDayliTheme(useGoogleFonts: false),
        home: Scaffold(body: SizedBox(width: 300, height: 300, child: child)),
      ),
    ),
  );

  group('PrivateImage', () {
    testWidgets('asks once for a fresh URL, then gives up', (tester) async {
      harness.posts.mediaResults.add(
        ApiSuccess(media('m-1', url: 'https://storage.example.test/new')),
      );
      await show(
        tester,
        PrivateImage(
          postId: 'post-1',
          media: media('m-1'),
          semanticLabel: 'A photo',
        ),
      );

      // Test builds fail every network request, standing in for an expired URL.
      await tester.pumpAndSettle();
      expect(harness.posts.refreshed, [(postId: 'post-1', mediaId: 'm-1')]);
      expect(find.text('Photo unavailable'), findsOneWidget);
      expect(harness.posts.refreshed, hasLength(1));
    });

    testWidgets('loads the fresh URL after an expiry', (tester) async {
      harness.posts.mediaResults.add(
        ApiSuccess(media('m-1', url: 'https://storage.example.test/new')),
      );
      await show(
        tester,
        PrivateImage(
          postId: 'post-1',
          media: media('m-1'),
          semanticLabel: 'A photo',
        ),
      );
      await tester.pump();
      await tester.pump();
      await tester.pump();

      final image = tester.widget<Image>(find.byType(Image));
      expect(
        (image.image as NetworkImage).url,
        'https://storage.example.test/new',
      );
    });

    testWidgets('shows a placeholder without a URL and never asks', (
      tester,
    ) async {
      await show(
        tester,
        PrivateImage(
          postId: 'post-1',
          media: media('m-1', url: null),
          semanticLabel: 'A photo',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Photo unavailable'), findsOneWidget);
      expect(harness.posts.refreshed, isEmpty);
    });
  });

  group('PrivateVideo', () {
    PrivateVideo video([String? url = 'https://storage.example.test/old']) =>
        PrivateVideo(
          postId: 'post-1',
          media: media('m-1', contentType: 'video/mp4', url: url),
          semanticLabel: "Ana's video",
        );

    testWidgets('plays on its own, muted and looping', (tester) async {
      await show(tester, video());
      await tester.pumpAndSettle();

      expect(videos.sources, ['https://storage.example.test/old']);
      // The player applies its defaults first; the app's settings win.
      expect(videos.calls.sublist(videos.calls.length - 3), [
        'loop:true',
        'volume:0.0',
        'play',
      ]);
      expect(find.byTooltip('Turn sound on'), findsOneWidget);
    });

    testWidgets('turns the sound on and pauses on tap', (tester) async {
      await show(tester, video());
      await tester.pumpAndSettle();
      videos.calls.clear();

      await tester.tap(find.byKey(const Key('post.video.sound')));
      await tester.pumpAndSettle();
      expect(videos.calls, ['volume:1.0']);
      expect(find.byTooltip('Turn sound off'), findsOneWidget);

      await tester.tap(find.byKey(const Key('post.video')));
      await tester.pumpAndSettle();
      expect(videos.calls.last, 'pause');
    });

    testWidgets('reopens with a fresh URL once when loading fails', (
      tester,
    ) async {
      videos.failures = 1;
      harness.posts.mediaResults.add(
        ApiSuccess(
          media(
            'm-1',
            contentType: 'video/mp4',
            url: 'https://storage.example.test/new',
          ),
        ),
      );
      await show(tester, video());
      await tester.pumpAndSettle();

      expect(harness.posts.refreshed, hasLength(1));
      expect(videos.sources, [
        'https://storage.example.test/old',
        'https://storage.example.test/new',
      ]);
      expect(videos.calls, contains('play'));
    });

    testWidgets('gives up when the refresh is refused', (tester) async {
      videos.failures = 1;
      await show(tester, video());
      await tester.pumpAndSettle();

      expect(find.text('Video unavailable'), findsOneWidget);
      expect(videos.sources, hasLength(1));
    });
  });
}

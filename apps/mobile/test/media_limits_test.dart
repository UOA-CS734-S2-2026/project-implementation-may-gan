import 'package:dayli_mobile/app/theme.dart';
import 'package:dayli_mobile/compose/composer_controller.dart';
import 'package:dayli_mobile/compose/media_input.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const photo = DraftAttachment(localPath: '/photos/0.jpg', mediaType: 'image');
const video = DraftAttachment(localPath: '/videos/0.mp4', mediaType: 'video');

const mb = 1024 * 1024;

void main() {
  test('matches the API limits exactly', () {
    expect(DailyPostLimits.attachmentBytesMax, 10485760);
    expect(DailyPostLimits.postBytesMax, 26214400);
    expect(DailyPostLimits.videoDurationMax, const Duration(seconds: 15));
  });

  test('accepts an attachment of exactly 10 MB and rejects one byte more', () {
    expect(
      checkAttachmentLimits(mediaType: 'image', byteSize: 10 * mb),
      isNull,
    );
    expect(
      checkAttachmentLimits(mediaType: 'image', byteSize: 10 * mb + 1),
      MediaLimitViolation.attachmentTooLarge,
    );
  });

  test('rejects an empty file', () {
    expect(
      checkAttachmentLimits(mediaType: 'image', byteSize: 0),
      MediaLimitViolation.empty,
    );
  });

  test('accepts a video of exactly 15 seconds and rejects anything longer', () {
    expect(
      checkAttachmentLimits(
        mediaType: 'video',
        byteSize: mb,
        videoDuration: const Duration(seconds: 15),
      ),
      isNull,
    );
    expect(
      checkAttachmentLimits(
        mediaType: 'video',
        byteSize: mb,
        videoDuration: const Duration(seconds: 15, milliseconds: 1),
      ),
      MediaLimitViolation.videoTooLong,
    );
  });

  test('rejects a video whose duration is unknown', () {
    expect(
      checkAttachmentLimits(mediaType: 'video', byteSize: mb),
      MediaLimitViolation.videoTooLong,
    );
  });

  test('ignores duration for photos', () {
    expect(
      checkAttachmentLimits(
        mediaType: 'image',
        byteSize: mb,
        videoDuration: const Duration(minutes: 5),
      ),
      isNull,
    );
  });

  test('accepts a post total of exactly 25 MB and rejects one byte more', () {
    expect(
      checkAttachmentLimits(
        mediaType: 'image',
        byteSize: 5 * mb,
        otherBytes: const [10 * mb, 10 * mb],
      ),
      isNull,
    );
    expect(
      checkAttachmentLimits(
        mediaType: 'image',
        byteSize: 5 * mb + 1,
        otherBytes: const [10 * mb, 10 * mb],
      ),
      MediaLimitViolation.postTooLarge,
    );
  });

  test('reports the per-file limit before the post total', () {
    expect(
      checkAttachmentLimits(
        mediaType: 'image',
        byteSize: 10 * mb + 1,
        otherBytes: const [10 * mb, 10 * mb],
      ),
      MediaLimitViolation.attachmentTooLarge,
    );
  });

  test('allows up to three photos or a single video', () {
    expect(canAddAttachment(const []), isTrue);
    expect(canAddAttachment(const [photo]), isTrue);
    expect(canAddAttachment(const [photo, photo]), isTrue);
    expect(canAddAttachment(const [photo, photo, photo]), isFalse);
    expect(canAddAttachment(const [video]), isFalse);
  });

  testWidgets('offers a photo or video again once every photo is removed', (
    tester,
  ) async {
    var attachments = [photo, photo];
    final picked = <int>[];
    late StateSetter setState;
    await tester.pumpWidget(
      MaterialApp(
        theme: buildDayliTheme(useGoogleFonts: false),
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setter) {
              setState = setter;
              return MediaInput(
                attachments: attachments,
                onPick: picked.add,
                onRemove: (index) => setState(
                  () => attachments = [...attachments]..removeAt(index),
                ),
              );
            },
          ),
        ),
      ),
    );
    expect(find.bySemanticsLabel('Add another photo'), findsOneWidget);

    await tester.tap(find.byKey(const Key('composer.media.remove')).first);
    await tester.pump();
    await tester.tap(find.byKey(const Key('composer.media.remove')).first);
    await tester.pump();

    expect(find.bySemanticsLabel('Add a photo or video'), findsOneWidget);
    await tester.tap(find.byKey(const Key('composer.media.0')));
    expect(picked, [0]);
  });

  testWidgets('hides the add tile once a video is chosen', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildDayliTheme(useGoogleFonts: false),
        home: Scaffold(
          body: MediaInput(
            attachments: const [video],
            onPick: (_) {},
            onRemove: (_) {},
          ),
        ),
      ),
    );
    expect(find.bySemanticsLabel(RegExp('^Add ')), findsNothing);
    expect(find.byKey(const Key('composer.media.1')), findsNothing);
  });
}

import 'package:dayli_mobile/app/theme.dart';
import 'package:dayli_mobile/compose/media_input.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const photo = DraftAttachment(localPath: '/photos/0.jpg', mediaType: 'image');
const video = DraftAttachment(localPath: '/videos/0.mp4', mediaType: 'video');

Future<void> show(
  WidgetTester tester, {
  List<DraftAttachment> attachments = const [photo],
  List<MediaTileState> states = const [],
  bool uploads = true,
  String? error,
  String? notice,
  String? problem,
  VoidCallback? onRetry,
}) => tester.pumpWidget(
  MaterialApp(
    theme: buildDayliTheme(useGoogleFonts: false),
    home: Scaffold(
      body: MediaInput(
        attachments: attachments,
        onPick: (_) {},
        onRemove: (_) {},
        uploads: uploads,
        states: states,
        error: error,
        notice: notice,
        problem: problem,
        onRetry: onRetry,
      ),
    ),
  ),
);

String status(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const Key('composer.media.status'))).data!;

void main() {
  testWidgets('labels each tile with its upload state', (tester) async {
    final labels = {
      MediaTileState.queued: 'Photo, waiting to upload',
      MediaTileState.compressing: 'Photo, preparing',
      MediaTileState.uploading: 'Photo, uploading',
      MediaTileState.checking: 'Photo, checking',
      MediaTileState.done: 'Photo, uploaded',
      MediaTileState.failed: "Photo, couldn't be uploaded",
    };
    for (final MapEntry(key: state, value: label) in labels.entries) {
      await show(tester, states: [state]);
      expect(find.bySemanticsLabel(label), findsOneWidget, reason: '$state');
    }
    await show(
      tester,
      attachments: const [video],
      states: const [MediaTileState.uploading],
    );
    expect(find.bySemanticsLabel('Video, uploading'), findsOneWidget);
  });

  testWidgets('shows progress until every upload is done', (tester) async {
    await show(tester, attachments: const [], states: const []);
    expect(status(tester), 'Optional. Add up to 3 photos, or 1 video.');

    await show(
      tester,
      attachments: const [photo, photo],
      states: const [MediaTileState.done, MediaTileState.uploading],
    );
    expect(status(tester), '2/3 added. Uploading…');

    await show(
      tester,
      attachments: const [photo, photo],
      states: const [MediaTileState.done, MediaTileState.done],
    );
    expect(status(tester), '2/3 added.');
  });

  testWidgets('keeps the on-device wording when uploads are off', (
    tester,
  ) async {
    await show(tester, uploads: false);
    expect(status(tester), contains('stay on this device'));
    expect(find.bySemanticsLabel('Photo, saved on this device'), findsOne);
  });

  testWidgets('explains a rejected upload in plain words', (tester) async {
    await show(
      tester,
      attachments: [
        photo.copyWith(
          reservationId: () => 'reservation-1',
          status: AttachmentUploadStatus.failed,
          failureReason: () => 'format_mismatch',
        ),
      ],
      states: const [MediaTileState.failed],
    );
    expect(
      status(tester),
      "This file isn't a supported photo or video. Remove it to post.",
    );
  });

  testWidgets('offers a retry while uploads are paused', (tester) async {
    var retries = 0;
    await show(
      tester,
      states: const [MediaTileState.queued],
      problem: "You're offline. Uploads will continue when you're connected.",
      onRetry: () => retries++,
    );
    expect(status(tester), startsWith("You're offline"));
    await tester.tap(find.byKey(const Key('composer.media.retry')));
    expect(retries, 1);
  });

  testWidgets('puts a submit error before other messages', (tester) async {
    await show(
      tester,
      states: const [MediaTileState.uploading],
      error: 'Wait for your photos and videos to finish uploading.',
      notice: 'Videos can be up to 15 seconds long.',
      problem: "You're offline.",
      onRetry: () {},
    );
    expect(status(tester), startsWith('Wait for your photos'));
    expect(find.byKey(const Key('composer.media.retry')), findsNothing);

    await show(
      tester,
      states: const [MediaTileState.uploading],
      notice: 'Videos can be up to 15 seconds long.',
      problem: "You're offline.",
    );
    expect(status(tester), 'Videos can be up to 15 seconds long.');
  });

  test('describes every server failure reason', () {
    for (final reason in [
      'byte_size_mismatch',
      'format_mismatch',
      'duration_exceeded',
      'malformed_container',
      'object_not_found',
      null,
    ]) {
      expect(uploadFailureMessage(reason), isNotEmpty);
    }
    expect(uploadFailureMessage('duration_exceeded'), contains('15 seconds'));
  });
}

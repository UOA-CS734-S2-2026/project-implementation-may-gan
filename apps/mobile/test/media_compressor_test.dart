import 'dart:io';

import 'package:dayli_mobile/compose/composer_controller.dart';
import 'package:dayli_mobile/compose/media_compressor.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory root;
  late Directory picked;
  var names = 0;

  setUp(() async {
    root = await Directory.systemTemp.createTemp('support');
    picked = await Directory.systemTemp.createTemp('picked');
    names = 0;
  });

  tearDown(() async {
    await root.delete(recursive: true);
    await picked.delete(recursive: true);
  });

  String mediaDir() => '${root.path}/dayli-media/user-user-1';

  Future<DraftAttachment> pick(String name, String mediaType) async {
    final file = File('${picked.path}/$name');
    await file.writeAsBytes(List.filled(64, 1));
    return DraftAttachment(localPath: file.path, mediaType: mediaType);
  }

  DeviceMediaCompressor compressor({
    PhotoEncoder? encodePhoto,
    VideoProbe? probeVideo,
    VideoEncoder? encodeVideo,
  }) => DeviceMediaCompressor(
    supportDirectory: () async => root,
    encodePhoto:
        encodePhoto ??
        (source, target) async {
          await File(target).writeAsBytes(List.filled(1000, 7));
          return true;
        },
    probeVideo: probeVideo ?? (_) async => const Duration(seconds: 5),
    encodeVideo:
        encodeVideo ??
        (source) async {
          final out = File('${picked.path}/plugin-out.mp4');
          await out.writeAsBytes(List.filled(2000, 9));
          return out.path;
        },
    newName: () => 'name-${names++}',
  );

  test('writes a JPEG into app support storage', () async {
    final photo = await pick('IMG_0001.HEIC', 'image');
    String? encodedFrom;
    final result = await compressor(
      encodePhoto: (source, target) async {
        encodedFrom = source;
        await File(target).writeAsBytes(List.filled(1000, 7));
        return true;
      },
    ).compress(photo, ownerId: 'user-1');

    final media = (result as CompressionSucceeded).media;
    expect(encodedFrom, photo.localPath);
    expect(media.path, '${mediaDir()}/name-0.jpg');
    expect(media.contentType, 'image/jpeg');
    expect(media.byteSize, 1000);
    expect(media.videoDuration, isNull);
    expect(File(photo.localPath).existsSync(), isTrue);
  });

  test('fails when the photo encoder writes nothing or throws', () async {
    final photo = await pick('a.jpg', 'image');
    expect(
      await compressor(
        encodePhoto: (_, _) async => false,
      ).compress(photo, ownerId: 'user-1'),
      isA<CompressionFailed>(),
    );
    expect(
      await compressor(
        encodePhoto: (_, _) async => throw UnsupportedError('HEIC'),
      ).compress(photo, ownerId: 'user-1'),
      isA<CompressionFailed>(),
    );
  });

  test('rejects a video over 15 seconds without encoding it', () async {
    final video = await pick('clip.mov', 'video');
    var encoded = false;
    final result = await compressor(
      probeVideo: (_) async => const Duration(seconds: 15, milliseconds: 1),
      encodeVideo: (_) async {
        encoded = true;
        return null;
      },
    ).compress(video, ownerId: 'user-1');

    expect(result, isA<CompressionRejected>());
    expect(
      (result as CompressionRejected).violation,
      MediaLimitViolation.videoTooLong,
    );
    expect(encoded, isFalse);
  });

  test('moves an encoded video of exactly 15 seconds into storage', () async {
    final video = await pick('clip.mov', 'video');
    final result = await compressor(
      probeVideo: (_) async => const Duration(seconds: 15),
    ).compress(video, ownerId: 'user-1');

    final media = (result as CompressionSucceeded).media;
    expect(media.path, '${mediaDir()}/name-0.mp4');
    expect(media.contentType, 'video/mp4');
    expect(media.byteSize, 2000);
    expect(media.videoDuration, const Duration(seconds: 15));
    expect(File('${picked.path}/plugin-out.mp4').existsSync(), isFalse);
    expect(File(video.localPath).existsSync(), isTrue);
  });

  test('fails when a video cannot be probed or encoded', () async {
    final video = await pick('clip.mov', 'video');
    expect(
      await compressor(
        probeVideo: (_) async => null,
      ).compress(video, ownerId: 'user-1'),
      isA<CompressionFailed>(),
    );
    expect(
      await compressor(
        encodeVideo: (_) async => null,
      ).compress(video, ownerId: 'user-1'),
      isA<CompressionFailed>(),
    );
  });

  test('gives each compressed copy its own name', () async {
    final photo = await pick('a.jpg', 'image');
    final subject = compressor();
    final first =
        await subject.compress(photo, ownerId: 'user-1')
            as CompressionSucceeded;
    final second =
        await subject.compress(photo, ownerId: 'user-1')
            as CompressionSucceeded;
    expect(first.media.path, isNot(second.media.path));
    expect(File(first.media.path).existsSync(), isTrue);
  });

  test('discards only its own compressed copies', () async {
    final photo = await pick('a.jpg', 'image');
    final subject = compressor();
    final media =
        (await subject.compress(photo, ownerId: 'user-1')
                as CompressionSucceeded)
            .media;

    await subject.discard(photo.localPath);
    expect(File(photo.localPath).existsSync(), isTrue);

    await subject.discard(media.path);
    expect(File(media.path).existsSync(), isFalse);

    // Discarding twice is harmless.
    await subject.discard(media.path);
  });

  test(
    "keeps each user's copies apart and removes one user's on request",
    () async {
      final photo = await pick('a.jpg', 'image');
      final subject = compressor();
      final mine =
          (await subject.compress(photo, ownerId: 'user-1')
                  as CompressionSucceeded)
              .media;
      final theirs =
          (await subject.compress(photo, ownerId: 'user-2')
                  as CompressionSucceeded)
              .media;
      // A copy a crash left behind, which no draft refers to.
      final leftover = File('${mediaDir()}/orphan.jpg');
      await leftover.writeAsBytes([1]);

      await subject.discardAll('user-1');

      expect(File(mine.path).existsSync(), isFalse);
      expect(leftover.existsSync(), isFalse);
      expect(File(theirs.path).existsSync(), isTrue);
      expect(File(photo.localPath).existsSync(), isTrue);

      // Nothing left to remove is fine.
      await subject.discardAll('user-1');
    },
  );

  test('keeps an unusual user ID inside its own folder', () async {
    final photo = await pick('a.jpg', 'image');
    final media =
        (await compressor().compress(photo, ownerId: '../escape')
                as CompressionSucceeded)
            .media;
    expect(File(media.path).parent.parent.path, '${root.path}/dayli-media');

    // Dot segments survive URI encoding, so they need their own guard.
    for (final unsafe in ['..', '.', '']) {
      await compressor().discardAll(unsafe);
      expect(root.existsSync(), isTrue, reason: unsafe);
      expect(File(media.path).existsSync(), isTrue, reason: unsafe);
    }
  });
}

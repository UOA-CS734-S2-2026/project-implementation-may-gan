import 'dart:io';

import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';
import 'package:v_video_compressor/v_video_compressor.dart';

import '../drafts/daily_post_draft.dart';
import 'composer_controller.dart';

/// A compressed copy ready to reserve and upload.
class CompressedMedia {
  const CompressedMedia({
    required this.path,
    required this.contentType,
    required this.byteSize,
    this.videoDuration,
  });

  final String path;

  /// Always `image/jpeg` or `video/mp4`.
  final String contentType;
  final int byteSize;

  /// Set for videos only.
  final Duration? videoDuration;
}

sealed class CompressionResult {
  const CompressionResult();
}

class CompressionSucceeded extends CompressionResult {
  const CompressionSucceeded(this.media);

  final CompressedMedia media;
}

/// The file breaks a limit that compression can't fix, such as a video
/// longer than 15 seconds.
class CompressionRejected extends CompressionResult {
  const CompressionRejected(this.violation);

  final MediaLimitViolation violation;
}

/// The file couldn't be read or encoded.
class CompressionFailed extends CompressionResult {
  const CompressionFailed();
}

/// Turns a picked photo or video into the upload format. The compressed copy
/// lives in app support storage so it survives a restart mid-upload, and it
/// never carries the source's EXIF or location metadata.
abstract interface class MediaCompressor {
  Future<CompressionResult> compress(DraftAttachment attachment);

  /// Deletes a compressed copy made by [compress]. Other paths, including
  /// the file the author picked, are left alone.
  Future<void> discard(String compressedPath);
}

/// Writes a JPEG of [source] to [target]. Returns false if nothing was written.
typedef PhotoEncoder = Future<bool> Function(String source, String target);

/// Returns a video's duration, or null if it can't be read.
typedef VideoProbe = Future<Duration?> Function(String source);

/// Encodes [source] as an H.264 MP4 and returns where the plugin wrote it, or
/// null on failure.
typedef VideoEncoder = Future<String?> Function(String source);

class DeviceMediaCompressor implements MediaCompressor {
  DeviceMediaCompressor({
    Future<Directory> Function()? supportDirectory,
    PhotoEncoder? encodePhoto,
    VideoProbe? probeVideo,
    VideoEncoder? encodeVideo,
    String Function()? newName,
  }) : _supportDirectory = supportDirectory ?? getApplicationSupportDirectory,
       _encodePhoto = encodePhoto ?? _encodeJpeg,
       _probeVideo = probeVideo ?? _probeDuration,
       _encodeVideo = encodeVideo ?? _encodeMp4,
       _newName = newName ?? generateIdempotencyKey;

  static const _folder = 'dayli-media';

  /// Longest edge of a compressed photo, in pixels.
  static const photoEdgeMax = 2048;
  static const photoQuality = 80;
  static const videoBitrate = 2500000;

  final Future<Directory> Function() _supportDirectory;
  final PhotoEncoder _encodePhoto;
  final VideoProbe _probeVideo;
  final VideoEncoder _encodeVideo;
  final String Function() _newName;

  Future<Directory> _mediaDirectory() async {
    final root = await _supportDirectory();
    return Directory('${root.path}/$_folder').create(recursive: true);
  }

  @override
  Future<CompressionResult> compress(DraftAttachment attachment) async {
    try {
      final directory = await _mediaDirectory();
      return attachment.mediaType == 'video'
          ? await _compressVideo(attachment.localPath, directory)
          : await _compressPhoto(attachment.localPath, directory);
    } catch (_) {
      // Plugins report unreadable or unsupported files by throwing.
      return const CompressionFailed();
    }
  }

  Future<CompressionResult> _compressPhoto(
    String source,
    Directory directory,
  ) async {
    final target = '${directory.path}/${_newName()}.jpg';
    if (!await _encodePhoto(source, target)) return const CompressionFailed();
    return _finish(target, 'image/jpeg');
  }

  Future<CompressionResult> _compressVideo(
    String source,
    Directory directory,
  ) async {
    // Check the length first: encoding a long video only to reject it wastes
    // time and battery.
    final duration = await _probeVideo(source);
    if (duration == null) return const CompressionFailed();
    if (duration > DailyPostLimits.videoDurationMax) {
      return const CompressionRejected(MediaLimitViolation.videoTooLong);
    }
    final encoded = await _encodeVideo(source);
    if (encoded == null) return const CompressionFailed();
    final target = '${directory.path}/${_newName()}.mp4';
    await _move(encoded, target);
    return _finish(target, 'video/mp4', videoDuration: duration);
  }

  Future<CompressionResult> _finish(
    String path,
    String contentType, {
    Duration? videoDuration,
  }) async {
    final file = File(path);
    if (!await file.exists()) return const CompressionFailed();
    return CompressionSucceeded(
      CompressedMedia(
        path: path,
        contentType: contentType,
        byteSize: await file.length(),
        videoDuration: videoDuration,
      ),
    );
  }

  /// Renames within a volume, and copies across volumes.
  static Future<void> _move(String from, String to) async {
    final source = File(from);
    try {
      await source.rename(to);
    } on FileSystemException {
      await source.copy(to);
      await source.delete();
    }
  }

  @override
  Future<void> discard(String compressedPath) async {
    final directory = await _mediaDirectory();
    final file = File(compressedPath);
    if (file.parent.absolute.path != directory.absolute.path) return;
    try {
      await file.delete();
    } on FileSystemException {
      // Already gone.
    }
  }

  static Future<bool> _encodeJpeg(String source, String target) async {
    // minWidth and minHeight are upper bounds that keep the aspect ratio, so
    // together they cap the longest edge. keepExif: false drops location
    // data; the orientation is applied to the pixels first.
    final file = await FlutterImageCompress.compressAndGetFile(
      source,
      target,
      minWidth: photoEdgeMax,
      minHeight: photoEdgeMax,
      quality: photoQuality,
      format: CompressFormat.jpeg,
      keepExif: false,
    );
    return file != null;
  }

  static Future<Duration?> _probeDuration(String source) async {
    final info = await VVideoCompressor().getVideoInfo(source);
    return info == null ? null : Duration(milliseconds: info.durationMillis);
  }

  static Future<String?> _encodeMp4(String source) async {
    final result = await VVideoCompressor().compressVideo(
      source,
      const VVideoCompressionConfig.medium(
        // Always re-encode: the original may be a HEVC .mov, which doesn't
        // match a video/mp4 reservation.
        fallbackToOriginalIfNotSmaller: false,
        // Phone videos record location in their metadata.
        includeMetadata: false,
        copyMetadata: false,
        advanced: VVideoAdvancedConfig(
          videoBitrate: videoBitrate,
          videoCodec: VVideoCodec.h264,
          audioCodec: VAudioCodec.aac,
        ),
      ),
    );
    if (result == null || result.usedOriginalFile) return null;
    return result.compressedFilePath;
  }
}

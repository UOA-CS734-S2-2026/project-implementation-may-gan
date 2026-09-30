import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../app/theme.dart';
import '../drafts/daily_post_draft.dart';
import 'composer_controller.dart';

/// Where one attachment is, as shown on its tile.
enum MediaTileState {
  /// Kept on the device only; this build doesn't upload.
  local,
  queued,
  compressing,
  uploading,
  checking,
  done,
  failed,
}

/// A plain-language reason for a server rejection.
String uploadFailureMessage(String? reason) => switch (reason) {
  'format_mismatch' => "This file isn't a supported photo or video.",
  'duration_exceeded' => 'Videos can be up to 15 seconds long.',
  'malformed_container' => 'This file looks damaged.',
  'byte_size_mismatch' ||
  'object_not_found' => "The upload didn't finish properly.",
  _ => "This file couldn't be uploaded.",
};

/// A row of three square tiles: chosen photos (or one video) and an add tile.
/// Follows WDCC's rule of up to three photos, or a single video.
class MediaInput extends StatelessWidget {
  const MediaInput({
    super.key,
    required this.attachments,
    required this.onPick,
    required this.onRemove,
    this.error,
    this.uploads = false,
    this.states = const [],
    this.notice,
    this.problem,
    this.onRetry,
  });

  final List<DraftAttachment> attachments;

  /// Called with the slot to fill; the first slot accepts a photo or a video.
  final ValueChanged<int> onPick;
  final ValueChanged<int> onRemove;
  final String? error;

  /// True when this build uploads media rather than keeping it on the device.
  final bool uploads;

  /// One per attachment. Missing entries show as [MediaTileState.local].
  final List<MediaTileState> states;

  /// Why a picked file was dropped.
  final String? notice;

  /// Why uploads are paused, shown with a retry action.
  final String? problem;
  final VoidCallback? onRetry;

  bool get _canAdd => canAddAttachment(attachments);

  MediaTileState _stateAt(int index) =>
      index < states.length ? states[index] : MediaTileState.local;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final tiles = <Widget>[
      for (var index = 0; index < attachments.length; index++)
        _Preview(
          key: Key('composer.media.$index'),
          attachment: attachments[index],
          state: _stateAt(index),
          onRemove: () => onRemove(index),
        ),
      if (_canAdd)
        _AddTile(
          key: Key('composer.media.${attachments.length}'),
          first: attachments.isEmpty,
          invalid: error != null,
          onTap: () => onPick(attachments.length),
        ),
    ];
    while (tiles.length < DailyPostLimits.photosMax) {
      tiles.add(const SizedBox.shrink());
    }

    final (text, alert) = _message();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            for (var index = 0; index < tiles.length; index++) ...[
              if (index > 0) const SizedBox(width: 10),
              Expanded(child: AspectRatio(aspectRatio: 1, child: tiles[index])),
            ],
          ],
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                text,
                key: const Key('composer.media.status'),
                style: DayliText.sans(
                  context,
                  size: DayliTextSize.sm,
                  color: alert ? colors.danger : colors.foregroundTertiary,
                ),
              ),
            ),
            if (problem != null && onRetry != null && error == null)
              TextButton(
                key: const Key('composer.media.retry'),
                onPressed: onRetry,
                child: const Text('Try again'),
              ),
          ],
        ),
      ],
    );
  }

  /// The line under the tiles, most urgent first, and whether it's a problem.
  (String, bool) _message() {
    if (error case final error?) return (error, true);
    if (notice case final notice?) return (notice, true);
    if (problem case final problem?) return (problem, true);
    for (var index = 0; index < attachments.length; index++) {
      if (_stateAt(index) == MediaTileState.failed) {
        final reason = uploadFailureMessage(attachments[index].failureReason);
        return ('$reason Remove it to post.', true);
      }
    }
    return (_summary(), false);
  }

  String _summary() {
    if (!uploads) {
      return attachments.isEmpty
          ? "Optional. Add up to 3 photos, or 1 video. They stay on "
                "this device for now and aren't posted yet."
          : "${attachments.length}/3 added. They stay on this device "
                "for now and aren't posted yet.";
    }
    if (attachments.isEmpty) return 'Optional. Add up to 3 photos, or 1 video.';
    final allDone = [
      for (var index = 0; index < attachments.length; index++) _stateAt(index),
    ].every((state) => state == MediaTileState.done);
    return allDone
        ? '${attachments.length}/3 added.'
        : '${attachments.length}/3 added. Uploading…';
  }
}

class _AddTile extends StatelessWidget {
  const _AddTile({
    super.key,
    required this.first,
    required this.invalid,
    required this.onTap,
  });

  final bool first;
  final bool invalid;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final color = invalid ? colors.danger : colors.foregroundTertiary;
    return Semantics(
      button: true,
      label: first ? 'Add a photo or video' : 'Add another photo',
      excludeSemantics: true,
      child: Material(
        color: colors.backgroundSecondary,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: CustomPaint(
            painter: _DashedBorderPainter(color: color),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.add_photo_alternate_outlined,
                    size: 30,
                    color: color,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    first ? 'add' : 'more',
                    style: DayliText.serif(
                      context,
                      size: DayliTextSize.sm,
                      color: color,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({
    super.key,
    required this.attachment,
    required this.state,
    required this.onRemove,
  });

  final DraftAttachment attachment;
  final MediaTileState state;
  final VoidCallback onRemove;

  String get _stateLabel => switch (state) {
    MediaTileState.local => 'saved on this device',
    MediaTileState.queued => 'waiting to upload',
    MediaTileState.compressing => 'preparing',
    MediaTileState.uploading => 'uploading',
    MediaTileState.checking => 'checking',
    MediaTileState.done => 'uploaded',
    MediaTileState.failed => "couldn't be uploaded",
  };

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final missing = ColoredBox(
      color: colors.backgroundTertiary,
      child: Icon(
        Icons.image_not_supported_outlined,
        color: colors.foregroundTertiary,
      ),
    );
    final isVideo = attachment.mediaType == 'video';
    final Widget media = isVideo
        // A still tile marks the video until previews play.
        ? ColoredBox(
            color: colors.foreground,
            child: const Icon(
              Icons.play_circle_outline_rounded,
              size: 40,
              color: Colors.white,
            ),
          )
        : kIsWeb
        ? Image.network(
            attachment.localPath,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => missing,
          )
        : Image.file(
            File(attachment.localPath),
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => missing,
          );

    return Stack(
      fit: StackFit.expand,
      children: [
        // Its own node, so a screen reader reads each tile separately rather
        // than merged with the status line below.
        Semantics(
          container: true,
          label: '${isVideo ? 'Video' : 'Photo'}, $_stateLabel',
          excludeSemantics: true,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Stack(
              fit: StackFit.expand,
              children: [
                media,
                _StatusOverlay(state: state),
              ],
            ),
          ),
        ),
        Positioned(
          top: 0,
          right: 0,
          child: Semantics(
            button: true,
            label: 'Remove',
            excludeSemantics: true,
            child: GestureDetector(
              key: const Key('composer.media.remove'),
              behavior: HitTestBehavior.opaque,
              onTap: onRemove,
              // A 44dp target around a small visible badge.
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Container(
                  width: 28,
                  height: 28,
                  decoration: const BoxDecoration(
                    color: Color(0x99000000),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.close_rounded,
                    size: 18,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Dims a tile while it waits or works, and marks it done or failed.
class _StatusOverlay extends StatelessWidget {
  const _StatusOverlay({required this.state});

  final MediaTileState state;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    const scrim = Color(0x80000000);
    Widget centred(Widget child, {Color color = scrim}) => ColoredBox(
      color: color,
      child: Center(child: child),
    );
    return switch (state) {
      MediaTileState.local => const SizedBox.shrink(),
      MediaTileState.queued => centred(
        const Icon(Icons.schedule_rounded, color: Colors.white, size: 26),
      ),
      MediaTileState.compressing ||
      MediaTileState.uploading ||
      MediaTileState.checking => centred(
        const SizedBox(
          width: 26,
          height: 26,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            color: Colors.white,
          ),
        ),
      ),
      MediaTileState.done => Align(
        alignment: Alignment.bottomLeft,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: colors.success,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check_rounded,
              size: 16,
              color: Colors.white,
            ),
          ),
        ),
      ),
      MediaTileState.failed => centred(
        const Icon(Icons.error_outline_rounded, color: Colors.white, size: 30),
        color: colors.danger.withValues(alpha: 0.7),
      ),
    };
  }
}

/// Tailwind's `border-2 border-dashed`, as WDCC draws empty media slots.
class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const width = 1.5;
    const dash = 5.0;
    const gap = 5.0;
    final paint = Paint()
      ..color = color
      ..strokeWidth = width
      ..style = PaintingStyle.stroke;
    final rect = RRect.fromRectAndRadius(
      (Offset.zero & size).deflate(width / 2),
      const Radius.circular(14),
    );
    for (final metric in (Path()..addRRect(rect)).computeMetrics()) {
      for (
        var distance = 0.0;
        distance < metric.length;
        distance += dash + gap
      ) {
        canvas.drawPath(metric.extractPath(distance, distance + dash), paint);
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color;
}

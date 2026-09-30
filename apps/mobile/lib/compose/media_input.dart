import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../app/theme.dart';
import '../drafts/daily_post_draft.dart';
import 'composer_controller.dart';

/// A row of three square tiles: chosen photos (or one video) and an add tile.
/// Follows WDCC's rule of up to three photos, or a single video.
class MediaInput extends StatelessWidget {
  const MediaInput({
    super.key,
    required this.attachments,
    required this.onPick,
    required this.onRemove,
    this.error,
  });

  final List<DraftAttachment> attachments;

  /// Called with the slot to fill; the first slot accepts a photo or a video.
  final ValueChanged<int> onPick;
  final ValueChanged<int> onRemove;
  final String? error;

  bool get _canAdd => canAddAttachment(attachments);

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final tiles = <Widget>[
      for (var index = 0; index < attachments.length; index++)
        _Preview(
          key: Key('composer.media.$index'),
          attachment: attachments[index],
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
        Text(
          error ??
              (attachments.isEmpty
                  ? "Optional. Add up to 3 photos, or 1 video. They stay on "
                        "this device for now and aren't posted yet."
                  : "${attachments.length}/3 added. They stay on this device "
                        "for now and aren't posted yet."),
          style: DayliText.sans(
            context,
            size: DayliTextSize.sm,
            color: error != null ? colors.danger : colors.foregroundTertiary,
          ),
        ),
      ],
    );
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
  const _Preview({super.key, required this.attachment, required this.onRemove});

  final DraftAttachment attachment;
  final VoidCallback onRemove;

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
    final Widget media = attachment.mediaType == 'video'
        // Video previews play once uploads land; a still tile marks it.
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
        ClipRRect(borderRadius: BorderRadius.circular(14), child: media),
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

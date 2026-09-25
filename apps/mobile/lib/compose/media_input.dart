import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../app/theme.dart';
import '../drafts/daily_post_draft.dart';

/// WDCC's `MediaInput`: up to three photo slots, or a single video. Slot 1
/// appears once slot 0 holds a photo, and slot 2 once slot 1 does too.
class MediaInput extends StatelessWidget {
  const MediaInput({
    super.key,
    required this.attachments,
    required this.onPick,
    required this.onRemove,
    this.error,
  });

  final List<DraftAttachment> attachments;

  /// Called with the slot index; slot 0 accepts a photo or a video.
  final ValueChanged<int> onPick;
  final ValueChanged<int> onRemove;
  final String? error;

  static bool _isPhoto(DraftAttachment? attachment) =>
      attachment?.mediaType == 'image';

  int get _visibleSlots {
    DraftAttachment? at(int index) =>
        index < attachments.length ? attachments[index] : null;
    if (!_isPhoto(at(0))) return 1;
    if (!_isPhoto(at(1))) return 2;
    return 3;
  }

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final firstIsPhoto = attachments.isNotEmpty && _isPhoto(attachments.first);
    final photos = attachments.where(_isPhoto).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var index = 0; index < _visibleSlots; index++) ...[
          if (index > 0) const SizedBox(height: 16),
          index < attachments.length
              ? _Preview(
                  key: Key('composer.media.$index'),
                  attachment: attachments[index],
                  onTap: () => _confirmRemove(context, index),
                )
              : _EmptySlot(
                  key: Key('composer.media.$index'),
                  primary: index == 0,
                  onTap: () => onPick(index),
                ),
          if (index == 0 && error != null) ...[
            const SizedBox(height: 16),
            Text(
              error!,
              style: DayliText.sans(
                context,
                size: DayliTextSize.sm,
                color: colors.danger,
              ),
            ),
          ],
        ],
        if (firstIsPhoto) ...[
          const SizedBox(height: 8),
          Text(
            '$photos/3 uploaded',
            style: DayliText.sans(
              context,
              size: DayliTextSize.sm,
              color: colors.foregroundSecondary,
            ),
          ),
        ],
      ],
    );
  }

  /// WDCC removes media by dragging it to a bin; on a phone a tap asks first.
  Future<void> _confirmRemove(BuildContext context, int index) async {
    final remove = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: DayliColors.of(context).background,
      builder: (context) => SafeArea(
        child: ListTile(
          key: const Key('composer.media.remove'),
          leading: const Icon(Icons.delete_outline),
          title: Text(
            'Remove',
            style: DayliText.sans(context, weight: FontWeight.w500),
          ),
          onTap: () => Navigator.pop(context, true),
        ),
      ),
    );
    if (remove ?? false) onRemove(index);
  }
}

class _EmptySlot extends StatelessWidget {
  const _EmptySlot({super.key, required this.primary, required this.onTap});

  final bool primary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return GestureDetector(
      onTap: onTap,
      child: CustomPaint(
        painter: _DashedBorderPainter(color: colors.foregroundTertiary),
        child: SizedBox(
          height: 256,
          width: double.infinity,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.add_photo_alternate_outlined,
                size: primary ? 70 : 48,
                color: colors.foregroundTertiary,
              ),
              if (primary) ...[
                const SizedBox(height: 16),
                Text(
                  'Drag and drop or click to upload',
                  style: DayliText.sans(
                    context,
                    size: DayliTextSize.sm,
                    color: colors.foregroundTertiary,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({super.key, required this.attachment, required this.onTap});

  final DraftAttachment attachment;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    final missing = ColoredBox(
      color: colors.backgroundSecondary,
      child: Icon(
        Icons.broken_image_outlined,
        size: 48,
        color: colors.foregroundTertiary,
      ),
    );
    final Widget media = attachment.mediaType == 'video'
        // Video previews play once uploads land; a still tile marks it.
        ? ColoredBox(
            color: colors.foreground,
            child: const Icon(
              Icons.play_circle_outline,
              size: 64,
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
    return GestureDetector(
      onTap: onTap,
      child: AspectRatio(
        aspectRatio: 1,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox.expand(child: media),
        ),
      ),
    );
  }
}

/// Tailwind's `border-2 border-dashed rounded-xl`.
class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const width = 2.0;
    const dash = 6.0;
    const gap = 6.0;
    final paint = Paint()
      ..color = color
      ..strokeWidth = width
      ..style = PaintingStyle.stroke;
    final rect = RRect.fromRectAndRadius(
      (Offset.zero & size).deflate(width / 2),
      const Radius.circular(12),
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

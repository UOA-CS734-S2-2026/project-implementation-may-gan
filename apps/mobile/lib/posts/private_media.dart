import 'dart:async';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../api/api_failure.dart';
import '../api/post_media.dart';
import '../app/app_scope.dart';
import '../app/theme.dart';

/// Signed URLs expire after a few minutes, and a loaded post can outlive them.
/// On a load failure this asks once for a fresh URL; a second failure gives up.
mixin _RefreshOnce<T extends StatefulWidget> on State<T> {
  String get postId;
  PostMedia get media;

  Uri? url;
  bool _refreshed = false;
  bool failed = false;

  void resetTo(PostMedia next) {
    url = next.url;
    _refreshed = false;
    failed = next.url == null;
  }

  /// Returns the fresh URL, or null after marking the media as unavailable.
  Future<Uri?> refresh() async {
    if (_refreshed) {
      if (mounted) setState(() => failed = true);
      return null;
    }
    _refreshed = true;
    final result = await AppScope.of(context).posts.media(postId, media.id);
    if (!mounted) return null;
    final fresh = switch (result) {
      ApiSuccess(value: final value) => value.url,
      ApiError() => null,
    };
    setState(() {
      url = fresh;
      failed = fresh == null;
    });
    return fresh;
  }
}

class _Unavailable extends StatelessWidget {
  const _Unavailable(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = DayliColors.of(context);
    return ColoredBox(
      color: colors.backgroundSecondary,
      child: Center(
        child: Text(
          label,
          style: DayliText.sans(
            context,
            size: DayliTextSize.sm,
            color: colors.foregroundTertiary,
          ),
        ),
      ),
    );
  }
}

/// A private photo filling its box. Flutter only caches images in memory, so
/// nothing private is written to disk.
class PrivateImage extends StatefulWidget {
  const PrivateImage({
    super.key,
    required this.postId,
    required this.media,
    required this.semanticLabel,
  });

  final String postId;
  final PostMedia media;
  final String semanticLabel;

  @override
  State<PrivateImage> createState() => _PrivateImageState();
}

class _PrivateImageState extends State<PrivateImage>
    with _RefreshOnce<PrivateImage> {
  @override
  String get postId => widget.postId;
  @override
  PostMedia get media => widget.media;

  @override
  void initState() {
    super.initState();
    resetTo(widget.media);
  }

  @override
  void didUpdateWidget(PrivateImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.media.url != widget.media.url) resetTo(widget.media);
  }

  @override
  Widget build(BuildContext context) {
    final current = url;
    if (failed || current == null) {
      return const _Unavailable('Photo unavailable');
    }
    return Image.network(
      current.toString(),
      key: ValueKey(current),
      fit: BoxFit.cover,
      semanticLabel: widget.semanticLabel,
      errorBuilder: (context, _, _) {
        // Build can't await; ask after this frame and show the box meanwhile.
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && url == current) unawaited(refresh());
        });
        return ColoredBox(color: DayliColors.of(context).backgroundSecondary);
      },
    );
  }
}

/// A private video for the post screen. It plays on its own, muted, and
/// loops, since clips are at most 15 seconds. Tapping pauses or resumes, and
/// a button turns the sound on. The feed never shows this.
class PrivateVideo extends StatefulWidget {
  const PrivateVideo({
    super.key,
    required this.postId,
    required this.media,
    required this.semanticLabel,
  });

  final String postId;
  final PostMedia media;
  final String semanticLabel;

  @override
  State<PrivateVideo> createState() => _PrivateVideoState();
}

class _PrivateVideoState extends State<PrivateVideo>
    with _RefreshOnce<PrivateVideo> {
  VideoPlayerController? _controller;
  bool _muted = true;

  @override
  String get postId => widget.postId;
  @override
  PostMedia get media => widget.media;

  @override
  void initState() {
    super.initState();
    resetTo(widget.media);
    unawaited(_open(url));
  }

  @override
  void didUpdateWidget(PrivateVideo oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.media.url != widget.media.url) {
      resetTo(widget.media);
      unawaited(_open(url));
    }
  }

  Future<void> _open(Uri? source) async {
    final previous = _controller;
    _controller = null;
    // Don't make the viewer wait on the old player's cleanup.
    unawaited(previous?.dispose());
    if (source == null) {
      if (mounted) setState(() {});
      return;
    }
    final controller = VideoPlayerController.networkUrl(source);
    _controller = controller;
    try {
      await controller.initialize();
      await controller.setLooping(true);
      await controller.setVolume(_muted ? 0 : 1);
      await controller.play();
    } catch (_) {
      if (!mounted || _controller != controller) return;
      final fresh = await refresh();
      if (fresh != null && mounted) await _open(fresh);
      return;
    }
    if (mounted) setState(() {});
  }

  Future<void> _toggleSound() async {
    setState(() => _muted = !_muted);
    await _controller?.setVolume(_muted ? 0 : 1);
  }

  Future<void> _togglePlaying() async {
    final controller = _controller;
    if (controller == null) return;
    controller.value.isPlaying
        ? await controller.pause()
        : await controller.play();
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    unawaited(_controller?.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (failed) return const _Unavailable('Video unavailable');
    if (controller == null || !controller.value.isInitialized) {
      return const ColoredBox(
        color: Colors.black,
        child: Center(
          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
        ),
      );
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        Semantics(
          label: widget.semanticLabel,
          button: true,
          hint: controller.value.isPlaying ? 'Pause' : 'Play',
          excludeSemantics: true,
          child: GestureDetector(
            key: const Key('post.video'),
            behavior: HitTestBehavior.opaque,
            onTap: () => unawaited(_togglePlaying()),
            child: ColoredBox(
              color: Colors.black,
              child: Center(
                child: AspectRatio(
                  aspectRatio: controller.value.aspectRatio,
                  child: VideoPlayer(controller),
                ),
              ),
            ),
          ),
        ),
        Positioned(
          right: 8,
          bottom: 8,
          child: IconButton.filled(
            key: const Key('post.video.sound'),
            tooltip: _muted ? 'Turn sound on' : 'Turn sound off',
            style: IconButton.styleFrom(
              backgroundColor: const Color(0x99000000),
            ),
            onPressed: () => unawaited(_toggleSound()),
            icon: Icon(
              _muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
              color: Colors.white,
            ),
          ),
        ),
      ],
    );
  }
}
